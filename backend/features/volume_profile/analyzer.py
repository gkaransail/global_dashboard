"""
Volume Profile analyzer.

For each ticker + timeframe:
  1. Fetch OHLCV data via yfinance
  2. Bucket prices into NUM_BUCKETS price levels
  3. Distribute each bar's volume across the buckets it spans (uniform)
  4. Split buy/sell per bar: buy_ratio = (close - low) / (high - low)
  5. Compute POC (max volume bucket), Value Area (70% of total), VWAP

Delta flow:
  Cumulative (buy_vol - sell_vol) over time bars — shows persistent
  buying vs selling pressure regardless of price direction.
"""
import logging
from datetime import datetime
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)

NUM_BUCKETS    = 50
VALUE_AREA_PCT = 0.70

CACHE_TTL = {
    "1d":  60,
    "5d":  300,
    "1mo": 600,
    "3mo": 1800,
    "6mo": 3600,
    "1y":  7200,
}

TIMEFRAME_PARAMS = {
    "1d":  {"period": "1d",  "interval": "1m"},
    "5d":  {"period": "5d",  "interval": "5m"},
    "1mo": {"period": "1mo", "interval": "1h"},
    "3mo": {"period": "3mo", "interval": "1d"},
    "6mo": {"period": "6mo", "interval": "1d"},
    "1y":  {"period": "1y",  "interval": "1d"},
}

DELTA_BAR_LIMIT = 200  # keep response size sane


def _buy_sell_split(h: float, l: float, c: float, vol: float):
    hl = h - l
    if hl < 1e-9 or vol == 0:
        return vol * 0.5, vol * 0.5
    buy_ratio = (c - l) / hl
    return vol * buy_ratio, vol * (1.0 - buy_ratio)


def _fetch(ticker: str, timeframe: str):
    params = TIMEFRAME_PARAMS[timeframe]
    t = yf.Ticker(ticker.upper())
    df = t.history(**params, auto_adjust=True)
    df = df.dropna(subset=["Open", "High", "Low", "Close", "Volume"])
    if len(df) < 2:
        raise ValueError(f"Insufficient price data for {ticker.upper()} / {timeframe}")
    return df


# ─── Volume Profile ────────────────────────────────────────────────────────

def get_volume_profile(ticker: str, timeframe: str = "1d") -> dict:
    cache_key = f"vp:profile:{ticker.upper()}:{timeframe}"
    cached = _cache.get(cache_key, CACHE_TTL.get(timeframe, 300))
    if cached:
        return cached

    df = _fetch(ticker, timeframe)

    highs  = df["High"].values.tolist()
    lows   = df["Low"].values.tolist()
    closes = df["Close"].values.tolist()
    vols   = df["Volume"].values.tolist()

    price_min = min(lows)
    price_max = max(highs)
    if price_max <= price_min:
        price_min *= 0.99
        price_max *= 1.01

    bucket_size = (price_max - price_min) / NUM_BUCKETS
    buckets_buy  = [0.0] * NUM_BUCKETS
    buckets_sell = [0.0] * NUM_BUCKETS

    for i in range(len(df)):
        h, l, c, v = highs[i], lows[i], closes[i], vols[i]
        if v == 0:
            continue
        buy_v, sell_v = _buy_sell_split(h, l, c, v)

        lo_idx = max(0, int((l - price_min) / bucket_size))
        hi_idx = min(NUM_BUCKETS - 1, int((h - price_min) / bucket_size))
        span = hi_idx - lo_idx + 1

        buy_per  = buy_v  / span
        sell_per = sell_v / span
        for b in range(lo_idx, hi_idx + 1):
            buckets_buy[b]  += buy_per
            buckets_sell[b] += sell_per

    totals = [buckets_buy[i] + buckets_sell[i] for i in range(NUM_BUCKETS)]
    total_volume = sum(totals)
    max_bucket_vol = max(totals) if totals else 1.0

    poc_idx = totals.index(max(totals))

    # Expand value area from POC until 70% of volume captured
    va_target = total_volume * VALUE_AREA_PCT
    va_vol = totals[poc_idx]
    lo_va = poc_idx
    hi_va = poc_idx
    while va_vol < va_target and (lo_va > 0 or hi_va < NUM_BUCKETS - 1):
        add_lo = totals[lo_va - 1] if lo_va > 0 else 0.0
        add_hi = totals[hi_va + 1] if hi_va < NUM_BUCKETS - 1 else 0.0
        if add_lo >= add_hi and lo_va > 0:
            lo_va -= 1
            va_vol += add_lo
        elif hi_va < NUM_BUCKETS - 1:
            hi_va += 1
            va_vol += add_hi
        elif lo_va > 0:
            lo_va -= 1
            va_vol += add_lo
        else:
            break

    poc_price = price_min + (poc_idx + 0.5) * bucket_size
    vah_price = price_min + (hi_va + 1) * bucket_size
    val_price = price_min + lo_va * bucket_size

    # VWAP over full period
    typical_sum = sum(((highs[i] + lows[i] + closes[i]) / 3.0) * vols[i] for i in range(len(df)))
    vol_sum = sum(vols)
    vwap = typical_sum / vol_sum if vol_sum > 0 else closes[-1]

    spot = closes[-1]

    # Build profile list: index 0 = highest price bucket
    profile = []
    for i in range(NUM_BUCKETS - 1, -1, -1):
        price_level = price_min + (i + 0.5) * bucket_size
        bv  = buckets_buy[i]
        sv  = buckets_sell[i]
        tot = bv + sv
        profile.append({
            "price":     round(price_level, 4),
            "buy_vol":   int(bv),
            "sell_vol":  int(sv),
            "total_vol": int(tot),
            "bar_pct":   round(tot / max_bucket_vol * 100.0, 1) if max_bucket_vol > 0 else 0.0,
            "buy_pct":   round(bv / tot * 100.0, 1) if tot > 0 else 50.0,
            "is_poc":    i == poc_idx,
            "in_va":     lo_va <= i <= hi_va,
        })

    result = {
        "ticker":       ticker.upper(),
        "timeframe":    timeframe,
        "spot":         round(spot, 4),
        "vwap":         round(vwap, 4),
        "poc":          round(poc_price, 4),
        "vah":          round(vah_price, 4),
        "val":          round(val_price, 4),
        "price_min":    round(price_min, 4),
        "price_max":    round(price_max, 4),
        "total_volume": int(total_volume),
        "buy_volume":   int(sum(buckets_buy)),
        "sell_volume":  int(sum(buckets_sell)),
        "buy_ratio":    round(sum(buckets_buy) / total_volume, 3) if total_volume > 0 else 0.5,
        "num_buckets":  NUM_BUCKETS,
        "profile":      profile,
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }
    _cache.set(cache_key, result)
    return result


# ─── Delta Flow ────────────────────────────────────────────────────────────

def get_delta_flow(ticker: str, timeframe: str = "1d") -> dict:
    cache_key = f"vp:delta:{ticker.upper()}:{timeframe}"
    cached = _cache.get(cache_key, CACHE_TTL.get(timeframe, 300))
    if cached:
        return cached

    df = _fetch(ticker, timeframe)

    highs  = df["High"].values.tolist()
    lows   = df["Low"].values.tolist()
    closes = df["Close"].values.tolist()
    vols   = df["Volume"].values.tolist()

    cumulative_delta = 0.0
    typical_sum = 0.0
    vol_sum = 0.0
    bars = []

    for i, idx in enumerate(df.index):
        h, l, c, v = highs[i], lows[i], closes[i], vols[i]
        buy_v, sell_v = _buy_sell_split(h, l, c, v)
        delta = buy_v - sell_v
        cumulative_delta += delta

        typical_sum += ((h + l + c) / 3.0) * v
        vol_sum += v
        vwap_running = typical_sum / vol_sum if vol_sum > 0 else c

        bars.append({
            "time":      idx.isoformat(),
            "close":     round(c, 4),
            "volume":    int(v),
            "buy_vol":   int(buy_v),
            "sell_vol":  int(sell_v),
            "delta":     int(delta),
            "cum_delta": int(cumulative_delta),
            "vwap":      round(vwap_running, 4),
        })

    # Downsample long series so the response stays fast in the browser
    if len(bars) > DELTA_BAR_LIMIT:
        step = len(bars) // DELTA_BAR_LIMIT
        bars = bars[::step]

    spot = closes[-1]
    vwap = typical_sum / vol_sum if vol_sum > 0 else spot

    result = {
        "ticker":     ticker.upper(),
        "timeframe":  timeframe,
        "spot":       round(spot, 4),
        "vwap":       round(vwap, 4),
        "cum_delta":  int(cumulative_delta),
        "buy_volume": int(sum(b["buy_vol"] for b in bars)),
        "sell_volume": int(sum(b["sell_vol"] for b in bars)),
        "bars":       bars,
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }
    _cache.set(cache_key, result)
    return result
