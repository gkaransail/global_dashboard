"""
Unusual options activity detector.

Flags contracts where volume significantly exceeds open interest
or where total premium is abnormally large — signals institutional
positioning or directional bets.
"""
import math
import logging
from datetime import datetime, date
import yfinance as yf
import pandas as pd
from core import cache as _cache
from features.options.analyzers.chain import _safe_float, _safe_int, _dte

logger = logging.getLogger(__name__)
CACHE_TTL = 600  # 10 min — reduces Yahoo Finance rate-limit hits


def _unusual_score(vol: int, oi: int, premium: float, iv: float | None) -> float:
    """
    Composite unusualness score 0-1.
    Weights: vol/OI ratio (40%), premium value (40%), IV spike (20%).
    """
    vol_oi = (vol / oi) if oi > 0 else vol / 10
    vol_oi_score = min(vol_oi / 10.0, 1.0)          # caps at 10x

    prem_score = min(math.log10(max(premium, 1)) / 7.0, 1.0)  # log scale up to $10M

    iv_score = 0.0
    if iv and iv > 0.5:
        iv_score = min((iv - 0.5) / 1.5, 1.0)       # elevated if IV > 50%

    return round(vol_oi_score * 0.40 + prem_score * 0.40 + iv_score * 0.20, 3)


def _process_unusual(df: pd.DataFrame, option_type: str, S: float, exp: str) -> list[dict]:
    dte = _dte(exp)
    rows = []
    for _, row in df.iterrows():
        vol = _safe_int(row.get("volume"))
        oi  = _safe_int(row.get("openInterest"))
        if vol < 100:                          # ignore low-volume noise
            continue

        strike = _safe_float(row.get("strike"), 2)
        iv     = _safe_float(row.get("impliedVolatility"), 4)
        bid    = _safe_float(row.get("bid"), 2)
        ask    = _safe_float(row.get("ask"), 2)
        last   = _safe_float(row.get("lastPrice"), 2)
        itm    = bool(row.get("inTheMoney", False))

        mid = round((bid + ask) / 2, 2) if bid is not None and ask is not None else (last or 0)
        premium_value = round(vol * mid * 100, 0) if mid else 0  # 100 shares per contract

        vol_oi_ratio = round(vol / oi, 2) if oi > 0 else None
        score = _unusual_score(vol, oi, premium_value, iv)

        # Minimum threshold to surface
        if score < 0.25 and (vol_oi_ratio or 0) < 0.5:
            continue

        # Directional sentiment
        if option_type == "call":
            moneyness = (S - strike) / S if S else 0
            sentiment = "bullish" if moneyness <= 0.05 else "bearish"  # far OTM calls can be hedges
        else:
            moneyness = (strike - S) / S if S else 0
            sentiment = "bearish" if moneyness >= -0.05 else "bullish"  # put buying = bearish, deep ITM put = hedging

        exp_dt = datetime.strptime(exp, "%Y-%m-%d")
        rows.append({
            "type":          option_type,
            "strike":        strike,
            "expiration":    exp,
            "expiration_label": f"{exp_dt.strftime('%b %d')}",
            "dte":           dte,
            "volume":        vol,
            "oi":            oi,
            "vol_oi_ratio":  vol_oi_ratio,
            "iv_pct":        round(iv * 100, 1) if iv else None,
            "mid":           mid,
            "premium_value": int(premium_value),
            "itm":           itm,
            "sentiment":     sentiment,
            "score":         score,
        })
    return rows


def get_unusual_activity(ticker: str, max_expirations: int = 6, min_score: float = 0.25) -> dict:
    key = f"options:unusual:{ticker.upper()}"
    cached = _cache.get(key, CACHE_TTL)
    if cached:
        return cached

    t = yf.Ticker(ticker.upper())

    try:
        spot_df = t.history(period="1d", auto_adjust=True)
        S = float(spot_df["Close"].iloc[-1]) if not spot_df.empty else None
    except Exception as e:
        logger.warning(f"Unusual history fetch failed for {ticker}: {e}")
        S = None
    if S is None:
        return {"ticker": ticker.upper(), "error": "Could not fetch spot price", "activity": []}

    try:
        expirations = t.options[:max_expirations]
    except Exception:
        return {"ticker": ticker.upper(), "error": "No options data available", "activity": []}

    activity = []
    for exp in expirations:
        try:
            chain = t.option_chain(exp)
            activity.extend(_process_unusual(chain.calls, "call", S, exp))
            activity.extend(_process_unusual(chain.puts,  "put",  S, exp))
        except Exception as e:
            logger.debug(f"Skipping {exp}: {e}")

    # Sort by score desc, then premium value
    activity.sort(key=lambda x: (x["score"], x["premium_value"]), reverse=True)
    activity = [a for a in activity if a["score"] >= min_score][:50]

    result = {
        "ticker":      ticker.upper(),
        "spot_price":  round(S, 2),
        "activity":    activity,
        "total_found": len(activity),
    }
    _cache.set(key, result)
    return result
