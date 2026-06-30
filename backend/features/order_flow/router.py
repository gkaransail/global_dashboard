from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np

router = APIRouter()

_TF_MAP = {
    "1d": ("1d", "1m"),
    "2d": ("2d", "2m"),
    "5d": ("5d", "5m"),
}


def _fetch(ticker: str, timeframe: str) -> pd.DataFrame:
    if timeframe not in _TF_MAP:
        raise ValueError(f"Unsupported timeframe '{timeframe}'. Use: {list(_TF_MAP)}")
    period, interval = _TF_MAP[timeframe]
    df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if df is None or df.empty:
        raise ValueError(f"No intraday data returned for {ticker}")
    if hasattr(df.index, "tz") and df.index.tz is not None:
        df.index = df.index.tz_convert("America/New_York")
    return df


def _enrich(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    hl = (df["High"] - df["Low"]).replace(0, np.nan)

    # Delta heuristic: close position within bar range → buy fraction
    # (close-low)/(high-low) = 1.0 means close at high → all buying
    # (close-low)/(high-low) = 0.0 means close at low → all selling
    buy_frac = ((df["Close"] - df["Low"]) / hl).fillna(0.5).clip(0, 1)
    df["buy_vol"]  = (buy_frac * df["Volume"]).round().astype(int)
    df["sell_vol"] = (df["Volume"] - df["buy_vol"]).astype(int)
    df["delta"]     = df["buy_vol"] - df["sell_vol"]
    df["cum_delta"] = df["delta"].cumsum()

    # OFI%: what % of this bar's volume was buying (50% = neutral)
    total = df["Volume"].replace(0, np.nan)
    df["ofi_pct"] = (df["buy_vol"] / total * 100).fillna(50).round(1)

    # Rolling 20-bar avg volume for size context
    avg_vol = df["Volume"].rolling(20, min_periods=1).mean().replace(0, np.nan).fillna(1)
    df["vol_multiple"] = (df["Volume"] / avg_vol).round(2)
    df["is_large_print"] = df["vol_multiple"] >= 2.0

    # Absorption: heavy volume but narrow range (price didn't move much despite big participation)
    atr = hl.rolling(14, min_periods=1).mean().replace(0, np.nan).fillna(1)
    df["is_absorption"] = ((df["vol_multiple"] >= 1.5) & ((hl / atr) < 0.5)).fillna(False)

    df["candle_type"] = np.where(df["Close"] >= df["Open"], "bull", "bear")
    return df


def _bar_dict(row, idx) -> dict:
    return {
        "time":           idx.isoformat(),
        "open":           round(float(row["Open"]),  4),
        "high":           round(float(row["High"]),  4),
        "low":            round(float(row["Low"]),   4),
        "close":          round(float(row["Close"]), 4),
        "volume":         int(row["Volume"]),
        "buy_vol":        int(row["buy_vol"]),
        "sell_vol":       int(row["sell_vol"]),
        "delta":          int(row["delta"]),
        "cum_delta":      int(row["cum_delta"]),
        "ofi_pct":        float(row["ofi_pct"]),
        "vol_multiple":   float(row["vol_multiple"]),
        "is_large_print": bool(row["is_large_print"]),
        "is_absorption":  bool(row["is_absorption"]),
        "candle_type":    str(row["candle_type"]),
    }


def _momentum_and_divergence(df: pd.DataFrame) -> dict:
    n = len(df)
    window = min(10, n // 2)
    if n < window * 2:
        return {"delta_momentum": "insufficient data", "divergence": None, "momentum_label": ""}

    recent = df["delta"].iloc[-window:].sum()
    prior  = df["delta"].iloc[-window * 2:-window].sum()

    if abs(recent) > abs(prior) * 1.2:
        momentum = "accelerating"
    elif abs(recent) < abs(prior) * 0.8:
        momentum = "decelerating"
    else:
        momentum = "steady"

    direction = "bullish" if recent > 0 else "bearish"
    momentum_label = f"{momentum} {direction}"

    # Divergence: compare price slope vs delta slope over last window
    price_up  = df["Close"].iloc[-1] > df["Close"].iloc[-window]
    delta_up  = df["cum_delta"].iloc[-1] > df["cum_delta"].iloc[-window]
    if price_up and not delta_up:
        divergence = "bearish"   # price rising but delta falling — warning
    elif not price_up and delta_up:
        divergence = "bullish"   # price falling but delta rising — potential reversal
    else:
        divergence = None

    return {
        "delta_momentum": momentum,
        "momentum_direction": direction,
        "momentum_label": momentum_label,
        "divergence": divergence,
        "recent_delta": int(recent),
        "prior_delta": int(prior),
    }


def _plain_english_tape(s: dict, momentum: dict) -> str:
    ticker = s["ticker"]
    bias   = s["bias"]
    cd     = s["cum_delta"]
    buy_pct = round(s["buy_volume"] / s["total_volume"] * 100) if s["total_volume"] else 50
    spot, vwap = s["spot"], s["vwap"]
    vwap_rel = "above" if spot >= vwap else "below"
    lp  = s["large_print_count"]
    ab  = s["absorption_count"]
    mom = momentum.get("momentum_label", "")
    div = momentum.get("divergence")

    lines = []
    lines.append(
        f"{'Buyers' if bias == 'bullish' else 'Sellers'} have been more aggressive today. "
        f"{buy_pct}% of volume was buying, giving a net delta of {cd:+,}."
    )
    lines.append(
        f"Price is currently {vwap_rel} VWAP (${vwap:.2f}), which means "
        f"{'buyers who bought at the average session price are in profit — a bullish sign' if vwap_rel == 'above' else 'buyers who bought at the average session price are underwater — a bearish sign'}."
    )
    if mom:
        lines.append(f"Delta momentum is {mom} — buying/selling pressure is {mom.split()[0]} in the last 10 bars.")
    if div == "bearish":
        lines.append("⚠ Bearish divergence: price is rising but cumulative delta is falling. Buyers are running out of steam — watch for a pullback.")
    elif div == "bullish":
        lines.append("⚠ Bullish divergence: price is falling but cumulative delta is rising. Sellers are losing conviction — potential reversal setup.")
    if lp > 0:
        lines.append(f"{lp} large prints detected (blocks 2× avg volume). {'Institutional activity is elevated.' if lp > 5 else 'Moderate institutional presence.'}")
    if ab > 0:
        lines.append(f"{ab} absorption event(s): heavy volume with little price movement — someone is absorbing the flow, often a reversal signal.")
    return " ".join(lines)


@router.get("/tape/{ticker}")
async def tape(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    bars      = [_bar_dict(row, idx) for idx, row in df.iterrows()]
    total_vol = int(df["Volume"].sum())
    buy_vol   = int(df["buy_vol"].sum())
    sell_vol  = int(df["sell_vol"].sum())
    cum_delta = int(df["cum_delta"].iloc[-1]) if len(df) else 0
    spot      = round(float(df["Close"].iloc[-1]), 4) if len(df) else None
    vwap      = round(float((df["Close"] * df["Volume"]).sum() / df["Volume"].sum()), 4) if total_vol else None

    summary = {
        "ticker":             ticker.upper(),
        "spot":               spot,
        "vwap":               vwap,
        "total_volume":       total_vol,
        "buy_volume":         buy_vol,
        "sell_volume":        sell_vol,
        "cum_delta":          cum_delta,
        "large_print_count":  int(df["is_large_print"].sum()),
        "absorption_count":   int(df["is_absorption"].sum()),
        "bias":               "bullish" if cum_delta > 0 else "bearish" if cum_delta < 0 else "neutral",
    }
    momentum = _momentum_and_divergence(df)
    summary.update(momentum)
    summary["reading"] = _plain_english_tape(summary, momentum)

    return {"ticker": ticker.upper(), "timeframe": timeframe, "bars": bars, "summary": summary}


# ── Large Prints ────────────────────────────────────────────────────────────

def _cluster_prints(prints: list, cluster_range: float = 0.50) -> list:
    if not prints:
        return []
    sorted_p = sorted(prints, key=lambda p: p["price"])
    clusters = []
    current  = [sorted_p[0]]
    for p in sorted_p[1:]:
        if p["price"] - current[0]["price"] <= cluster_range:
            current.append(p)
        else:
            clusters.append(current)
            current = [p]
    clusters.append(current)

    result = []
    for c in clusters:
        total_buy  = sum(p["buy_vol"]  for p in c)
        total_sell = sum(p["sell_vol"] for p in c)
        net_delta  = total_buy - total_sell
        result.append({
            "price_low":   round(min(p["price"] for p in c), 4),
            "price_high":  round(max(p["price"] for p in c), 4),
            "count":       len(c),
            "buy_vol":     total_buy,
            "sell_vol":    total_sell,
            "net_delta":   net_delta,
            "type":        "demand" if net_delta > 0 else "supply",
        })
    return sorted(result, key=lambda x: x["count"], reverse=True)


@router.get("/large_prints/{ticker}")
async def large_prints(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
    threshold: float = Query(2.0, ge=1.1, le=10.0),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    big = df[df["vol_multiple"] >= threshold]
    prints = [
        {
            "time":          idx.isoformat(),
            "price":         round(float(row["Close"]), 4),
            "volume":        int(row["Volume"]),
            "buy_vol":       int(row["buy_vol"]),
            "sell_vol":      int(row["sell_vol"]),
            "delta":         int(row["delta"]),
            "vol_multiple":  float(row["vol_multiple"]),
            "ofi_pct":       float(row["ofi_pct"]),
            "candle_type":   str(row["candle_type"]),
            "is_absorption": bool(row["is_absorption"]),
        }
        for idx, row in big.iterrows()
    ]
    clusters = _cluster_prints(prints)

    # Plain English
    if prints:
        supply_zones   = [c for c in clusters if c["type"] == "supply"   and c["count"] >= 2]
        demand_zones   = [c for c in clusters if c["type"] == "demand"   and c["count"] >= 2]
        single_supply  = [c for c in clusters if c["type"] == "supply"   and c["count"] == 1]
        single_demand  = [c for c in clusters if c["type"] == "demand"   and c["count"] == 1]
        reading_parts  = []
        if supply_zones:
            zones_str = ", ".join(f"${c['price_low']:.2f}–${c['price_high']:.2f}" for c in supply_zones[:2])
            reading_parts.append(f"Sellers clustered at {zones_str} — these are supply zones where institutions sold.")
        if demand_zones:
            zones_str = ", ".join(f"${c['price_low']:.2f}–${c['price_high']:.2f}" for c in demand_zones[:2])
            reading_parts.append(f"Buyers clustered at {zones_str} — these are demand zones where institutions bought.")
        if not reading_parts:
            reading_parts.append("Large prints are scattered — no clear institutional clustering at a specific price level.")
        reading = " ".join(reading_parts)
    else:
        reading = f"No prints above {threshold}× average volume in this window. Try lowering the threshold."

    return {
        "ticker":    ticker.upper(),
        "timeframe": timeframe,
        "threshold": threshold,
        "count":     len(prints),
        "prints":    prints,
        "clusters":  clusters,
        "reading":   reading,
    }


# ── Footprint ───────────────────────────────────────────────────────────────

def _value_area(levels: list, target_pct: float = 0.70) -> tuple[float, float]:
    total_vol = sum(l["buy_vol"] + l["sell_vol"] for l in levels)
    if total_vol == 0:
        return levels[0]["price"], levels[-1]["price"]
    poc = max(levels, key=lambda l: l["buy_vol"] + l["sell_vol"])
    poc_idx = levels.index(poc)
    included = {poc_idx}
    vol_accumulated = poc["buy_vol"] + poc["sell_vol"]
    target = total_vol * target_pct
    lo, hi = poc_idx, poc_idx
    while vol_accumulated < target:
        expand_up   = hi + 1 < len(levels)
        expand_down = lo - 1 >= 0
        if not expand_up and not expand_down:
            break
        up_vol   = (levels[hi + 1]["buy_vol"] + levels[hi + 1]["sell_vol"]) if expand_up   else -1
        down_vol = (levels[lo - 1]["buy_vol"] + levels[lo - 1]["sell_vol"]) if expand_down else -1
        if up_vol >= down_vol and expand_up:
            hi += 1
            vol_accumulated += up_vol
        else:
            lo -= 1
            vol_accumulated += down_vol
    # levels are sorted high→low, so levels[lo] has the highest price in VA
    return levels[hi]["price"], levels[lo]["price"]  # (VAL, VAH)


@router.get("/footprint/{ticker}")
async def footprint(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
    levels: int    = Query(30, ge=5, le=100),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=404, detail="No data")

    price_min = float(df["Low"].min())
    price_max = float(df["High"].max())
    step = (price_max - price_min) / levels if price_max > price_min else 0.01

    buckets: dict[float, dict] = {}
    for _, row in df.iterrows():
        lo, hi = float(row["Low"]), float(row["High"])
        buy_v  = float(row["buy_vol"])
        sell_v = float(row["sell_vol"])
        bar_range = hi - lo or step
        for level_price in np.arange(price_min, price_max + step, step):
            overlap = min(hi, level_price + step) - max(lo, level_price)
            if overlap <= 0:
                continue
            w   = overlap / bar_range
            key = round(level_price, 4)
            if key not in buckets:
                buckets[key] = {"price": key, "buy_vol": 0.0, "sell_vol": 0.0}
            buckets[key]["buy_vol"]  += buy_v * w
            buckets[key]["sell_vol"] += sell_v * w

    result_levels = []
    for b in sorted(buckets.values(), key=lambda x: -x["price"]):
        bv, sv = int(b["buy_vol"]), int(b["sell_vol"])
        total  = bv + sv or 1
        delta  = bv - sv
        # Imbalance: one side dominates by 3:1 or more
        if bv >= sv * 3:
            imbalance = "bullish"
        elif sv >= bv * 3:
            imbalance = "bearish"
        else:
            imbalance = "neutral"
        result_levels.append({
            "price":     b["price"],
            "buy_vol":   bv,
            "sell_vol":  sv,
            "delta":     delta,
            "ofi_pct":   round(bv / total * 100, 1),
            "imbalance": imbalance,
        })

    poc = max(result_levels, key=lambda x: x["buy_vol"] + x["sell_vol"])
    val, vah = _value_area(result_levels)   # val = value area low, vah = value area high
    total_delta = int(df["delta"].sum())
    spot = round(float(df["Close"].iloc[-1]), 4)
    vwap = round(float((df["Close"] * df["Volume"]).sum() / df["Volume"].sum()), 4)

    # Key zones: top demand (most positive delta) and supply (most negative delta) levels
    demand_zones = sorted(
        [l for l in result_levels if l["imbalance"] == "bullish"],
        key=lambda x: x["delta"], reverse=True
    )[:3]
    supply_zones = sorted(
        [l for l in result_levels if l["imbalance"] == "bearish"],
        key=lambda x: x["delta"]
    )[:3]

    # Plain English
    spot_in_va   = val <= spot <= vah
    spot_vs_poc  = "at" if abs(spot - poc["price"]) < step else ("above" if spot > poc["price"] else "below")
    reading_parts = [
        f"The Point of Control (POC) is ${poc['price']:.2f} — the price where the most volume traded today. "
        f"Current price is {spot_vs_poc} the POC.",
    ]
    reading_parts.append(
        f"The Value Area (${val:.2f}–${vah:.2f}) contains 70% of today's volume. "
        f"Price is {'inside' if spot_in_va else 'outside'} the value area — "
        f"{'this is the current equilibrium zone' if spot_in_va else 'price has extended beyond fair value and may revert to the VA'}."
    )
    if demand_zones:
        z = demand_zones[0]
        reading_parts.append(f"Strongest demand zone: ${z['price']:.2f} (buyers dominated with {z['ofi_pct']}% buy flow).")
    if supply_zones:
        z = supply_zones[0]
        reading_parts.append(f"Strongest supply zone: ${z['price']:.2f} (sellers dominated with {100 - z['ofi_pct']:.0f}% sell flow).")

    return {
        "ticker":        ticker.upper(),
        "timeframe":     timeframe,
        "spot":          spot,
        "vwap":          vwap,
        "poc_price":     poc["price"],
        "value_area_low":  val,
        "value_area_high": vah,
        "total_delta":   total_delta,
        "levels":        result_levels,
        "demand_zones":  demand_zones,
        "supply_zones":  supply_zones,
        "reading":       " ".join(reading_parts),
    }
