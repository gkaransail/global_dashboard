"""
Market Sentiment — Fear & Greed composite index.

Seven indicators, each scored -1.0 (extreme fear) to +1.0 (extreme greed):

  1. VIX vs 50MA       — low/rising VIX = fear, high/falling VIX = greed
  2. SPY Momentum      — 125-day price momentum
  3. Put/Call Ratio    — market-wide PCR across SPY options
  4. Safe Haven Demand — TLT relative strength vs SPY
  5. Junk Bond Demand  — HYG vs LQD relative performance
  6. Market Breadth    — % of sector ETFs above their 200MA
  7. Price Strength    — % of sectors near 52-week highs

Composite score 0–100 (maps from -1.0/+1.0 range).
Ranges: 0-25 Extreme Fear, 25-45 Fear, 45-55 Neutral, 55-75 Greed, 75-100 Extreme Greed
"""
import logging
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timezone
from core import cache as _cache

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes — sentiment moves intraday

SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLB", "XLRE", "XLU", "XLC"]


def _safe_download(ticker: str, period: str = "1y") -> pd.DataFrame:
    try:
        df = yf.download(ticker, period=period, progress=False, auto_adjust=True)
        if df.empty:
            return pd.DataFrame()
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    except Exception as e:
        logger.warning(f"Download failed for {ticker}: {e}")
        return pd.DataFrame()


def _clamp(val: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, val))


# ── Indicator 1: VIX vs 50-day MA ──────────────────────────────────────────

def _vix_indicator() -> dict:
    df = _safe_download("^VIX", period="6mo")
    if df.empty or len(df) < 50:
        return {"score": 0.0, "value": None, "ma50": None, "detail": "no data"}

    vix = float(df["Close"].iloc[-1])
    ma50 = float(df["Close"].rolling(50).mean().iloc[-1])

    # VIX below MA = calming (greed), above MA = fear
    ratio = (ma50 - vix) / ma50  # positive = VIX below MA
    score = _clamp(ratio * 3)    # scale: ±33% deviation → ±1.0

    # Absolute level adjustment: VIX > 30 is always fearful regardless of MA
    if vix > 30:
        score = _clamp(score - 0.4)
    elif vix < 15:
        score = _clamp(score + 0.2)

    label = "low/falling" if score > 0.1 else "high/rising" if score < -0.1 else "neutral"
    return {
        "score": round(score, 3),
        "value": round(vix, 2),
        "ma50": round(ma50, 2),
        "detail": f"VIX {vix:.1f} vs 50MA {ma50:.1f} ({label})"
    }


# ── Indicator 2: SPY 125-day Momentum ──────────────────────────────────────

def _momentum_indicator() -> dict:
    df = _safe_download("SPY", period="1y")
    if df.empty or len(df) < 126:
        return {"score": 0.0, "value": None, "momentum_pct": None, "detail": "no data"}

    current = float(df["Close"].iloc[-1])
    past = float(df["Close"].iloc[-126])
    momentum_pct = (current - past) / past * 100

    # +20% over 125 days → max greed; -20% → max fear
    score = _clamp(momentum_pct / 20)

    return {
        "score": round(score, 3),
        "value": round(current, 2),
        "momentum_pct": round(momentum_pct, 2),
        "detail": f"SPY {momentum_pct:+.1f}% over 125 days"
    }


# ── Indicator 3: Put/Call Ratio ────────────────────────────────────────────

def _pcr_indicator() -> dict:
    try:
        spy = yf.Ticker("SPY")
        exps = spy.options
        if not exps:
            return {"score": 0.0, "pcr": None, "detail": "no options data"}

        total_call_vol = 0
        total_put_vol = 0
        for exp in exps[:3]:  # 3 nearest expirations
            chain = spy.option_chain(exp)
            total_call_vol += int(chain.calls["volume"].fillna(0).sum())
            total_put_vol += int(chain.puts["volume"].fillna(0).sum())

        if total_call_vol == 0:
            return {"score": 0.0, "pcr": None, "detail": "zero call volume"}

        pcr = total_put_vol / total_call_vol

        # PCR < 0.7 = greed (heavy calls), PCR > 1.4 = fear (heavy puts)
        # score = -1.0 at PCR 1.4, 0 at PCR 1.0, +1.0 at PCR 0.6
        score = _clamp((1.0 - pcr) * 2.5)

        direction = "call-heavy (greed)" if pcr < 0.9 else "put-heavy (fear)" if pcr > 1.1 else "balanced"
        return {
            "score": round(score, 3),
            "pcr": round(pcr, 3),
            "detail": f"PCR {pcr:.2f} — {direction}"
        }
    except Exception as e:
        logger.warning(f"PCR calc failed: {e}")
        return {"score": 0.0, "pcr": None, "detail": str(e)}


# ── Indicator 4: Safe Haven Demand ─────────────────────────────────────────

def _safe_haven_indicator() -> dict:
    tlt = _safe_download("TLT", period="3mo")
    spy = _safe_download("SPY", period="3mo")

    if tlt.empty or spy.empty or len(tlt) < 20:
        return {"score": 0.0, "tlt_ret": None, "spy_ret": None, "detail": "no data"}

    # 20-day return comparison: TLT outperforming = fear (flight to safety)
    tlt_ret = (float(tlt["Close"].iloc[-1]) - float(tlt["Close"].iloc[-20])) / float(tlt["Close"].iloc[-20])
    spy_ret = (float(spy["Close"].iloc[-1]) - float(spy["Close"].iloc[-20])) / float(spy["Close"].iloc[-20])

    # Spread: if bonds outperform stocks, fear; if stocks outperform, greed
    spread = spy_ret - tlt_ret
    score = _clamp(spread * 10)  # ±10% spread → ±1.0

    direction = "stocks outperforming (greed)" if spread > 0.01 else "bonds outperforming (fear)" if spread < -0.01 else "neutral"
    return {
        "score": round(score, 3),
        "tlt_ret": round(tlt_ret * 100, 2),
        "spy_ret": round(spy_ret * 100, 2),
        "detail": f"SPY {spy_ret*100:+.1f}% vs TLT {tlt_ret*100:+.1f}% (20d) — {direction}"
    }


# ── Indicator 5: Junk Bond Demand ──────────────────────────────────────────

def _junk_bond_indicator() -> dict:
    hyg = _safe_download("HYG", period="3mo")
    lqd = _safe_download("LQD", period="3mo")

    if hyg.empty or lqd.empty or len(hyg) < 20:
        return {"score": 0.0, "hyg_ret": None, "lqd_ret": None, "detail": "no data"}

    hyg_ret = (float(hyg["Close"].iloc[-1]) - float(hyg["Close"].iloc[-20])) / float(hyg["Close"].iloc[-20])
    lqd_ret = (float(lqd["Close"].iloc[-1]) - float(lqd["Close"].iloc[-20])) / float(lqd["Close"].iloc[-20])

    # HYG outperforming LQD = risk-on (greed), underperforming = risk-off (fear)
    spread = hyg_ret - lqd_ret
    score = _clamp(spread * 15)

    direction = "risk-on (greed)" if spread > 0.005 else "risk-off (fear)" if spread < -0.005 else "neutral"
    return {
        "score": round(score, 3),
        "hyg_ret": round(hyg_ret * 100, 2),
        "lqd_ret": round(lqd_ret * 100, 2),
        "detail": f"HYG {hyg_ret*100:+.1f}% vs LQD {lqd_ret*100:+.1f}% (20d) — {direction}"
    }


# ── Indicator 6: Market Breadth ─────────────────────────────────────────────

def _breadth_indicator() -> dict:
    above_200ma = 0
    total = 0
    sector_data = []

    for etf in SECTOR_ETFS:
        df = _safe_download(etf, period="1y")
        if df.empty or len(df) < 200:
            continue
        price = float(df["Close"].iloc[-1])
        ma200 = float(df["Close"].rolling(200).mean().iloc[-1])
        is_above = price > ma200
        above_200ma += int(is_above)
        total += 1
        sector_data.append({"ticker": etf, "price": round(price, 2), "ma200": round(ma200, 2), "above": is_above})

    if total == 0:
        return {"score": 0.0, "pct_above_200ma": None, "detail": "no data"}

    pct = above_200ma / total
    # 100% above → +1.0, 0% above → -1.0
    score = _clamp((pct - 0.5) * 4)

    return {
        "score": round(score, 3),
        "pct_above_200ma": round(pct * 100, 1),
        "above_count": above_200ma,
        "total_sectors": total,
        "sectors": sector_data,
        "detail": f"{above_200ma}/{total} sectors above 200MA ({pct*100:.0f}%)"
    }


# ── Indicator 7: Price Strength ─────────────────────────────────────────────

def _price_strength_indicator() -> dict:
    near_high = 0
    total = 0
    sector_data = []

    for etf in SECTOR_ETFS:
        df = _safe_download(etf, period="1y")
        if df.empty or len(df) < 50:
            continue
        price = float(df["Close"].iloc[-1])
        high_52w = float(df["Close"].max())
        pct_from_high = (price - high_52w) / high_52w * 100
        is_near = pct_from_high >= -5  # within 5% of 52w high
        near_high += int(is_near)
        total += 1
        sector_data.append({"ticker": etf, "price": round(price, 2), "high_52w": round(high_52w, 2), "pct_from_high": round(pct_from_high, 1), "near_high": is_near})

    if total == 0:
        return {"score": 0.0, "pct_near_high": None, "detail": "no data"}

    pct = near_high / total
    score = _clamp((pct - 0.5) * 4)

    return {
        "score": round(score, 3),
        "pct_near_high": round(pct * 100, 1),
        "near_high_count": near_high,
        "total_sectors": total,
        "sectors": sector_data,
        "detail": f"{near_high}/{total} sectors within 5% of 52w high"
    }


# ── Composite ────────────────────────────────────────────────────────────────

WEIGHTS = {
    "vix":          0.20,
    "momentum":     0.15,
    "pcr":          0.20,
    "safe_haven":   0.15,
    "junk_bond":    0.10,
    "breadth":      0.10,
    "price_strength": 0.10,
}

LABELS = [
    (75, "Extreme Greed"),
    (55, "Greed"),
    (45, "Neutral"),
    (25, "Fear"),
    (0,  "Extreme Fear"),
]


def _score_to_index(score: float) -> int:
    """Map -1.0..+1.0 to 0..100."""
    return int(round((score + 1.0) / 2.0 * 100))


def _verdict(index: int) -> str:
    for threshold, label in LABELS:
        if index >= threshold:
            return label
    return "Extreme Fear"


def get_sentiment() -> dict:
    cached = _cache.get("sentiment:composite", ttl=CACHE_TTL)
    if cached:
        return cached

    indicators = {
        "vix":            _vix_indicator(),
        "momentum":       _momentum_indicator(),
        "pcr":            _pcr_indicator(),
        "safe_haven":     _safe_haven_indicator(),
        "junk_bond":      _junk_bond_indicator(),
        "breadth":        _breadth_indicator(),
        "price_strength": _price_strength_indicator(),
    }

    composite = sum(indicators[k]["score"] * WEIGHTS[k] for k in WEIGHTS)
    composite = _clamp(composite)
    fg_index = _score_to_index(composite)

    # Previous reading for delta (1h cache means this won't often differ but gives structure for future)
    prev_cached = _cache.get("sentiment:prev", ttl=86400)
    prev_index = prev_cached["fg_index"] if prev_cached else fg_index

    result = {
        "fg_index": fg_index,
        "verdict": _verdict(fg_index),
        "composite_score": round(composite, 4),
        "prev_index": prev_index,
        "change": fg_index - prev_index,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "indicators": {
            "vix":          {**indicators["vix"],          "weight": WEIGHTS["vix"],          "label": "Market Volatility",    "fg_score": _score_to_index(indicators["vix"]["score"])},
            "momentum":     {**indicators["momentum"],     "weight": WEIGHTS["momentum"],     "label": "Market Momentum",      "fg_score": _score_to_index(indicators["momentum"]["score"])},
            "pcr":          {**indicators["pcr"],          "weight": WEIGHTS["pcr"],          "label": "Put/Call Ratio",       "fg_score": _score_to_index(indicators["pcr"]["score"])},
            "safe_haven":   {**indicators["safe_haven"],   "weight": WEIGHTS["safe_haven"],   "label": "Safe Haven Demand",    "fg_score": _score_to_index(indicators["safe_haven"]["score"])},
            "junk_bond":    {**indicators["junk_bond"],    "weight": WEIGHTS["junk_bond"],    "label": "Junk Bond Demand",     "fg_score": _score_to_index(indicators["junk_bond"]["score"])},
            "breadth":      {**indicators["breadth"],      "weight": WEIGHTS["breadth"],      "label": "Market Breadth",       "fg_score": _score_to_index(indicators["breadth"]["score"])},
            "price_strength": {**indicators["price_strength"], "weight": WEIGHTS["price_strength"], "label": "Price Strength", "fg_score": _score_to_index(indicators["price_strength"]["score"])},
        },
    }

    _cache.set("sentiment:composite", result)
    # Store current as previous for next cycle
    _cache.set("sentiment:prev", {"fg_index": fg_index})

    return result
