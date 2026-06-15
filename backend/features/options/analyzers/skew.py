"""
IV Skew and term structure calculator.

Skew: IV plotted against strike (the volatility smile/smirk).
Term structure: ATM IV plotted against expiration (how vol changes over time).
"""
import logging
import math
from datetime import datetime
import yfinance as yf
import pandas as pd
from core import cache as _cache
from features.options.analyzers.chain import _safe_float, _safe_int, _dte

logger = logging.getLogger(__name__)
CACHE_TTL = 600  # 10 min — reduces Yahoo Finance rate-limit hits


def _atm_iv(df: pd.DataFrame, S: float) -> float | None:
    """Find IV of the strike closest to spot."""
    if df.empty:
        return None
    df = df.copy()
    df["_dist"] = (df["strike"] - S).abs()
    nearest = df.nsmallest(3, "_dist")
    ivs = [_safe_float(v, 4) for v in nearest["impliedVolatility"] if _safe_float(v) is not None]
    return round(sum(ivs) / len(ivs), 4) if ivs else None


def _skew_for_expiration(ticker_obj, exp: str, S: float) -> dict | None:
    try:
        chain = ticker_obj.option_chain(exp)
        lo, hi = S * 0.80, S * 1.20  # ±20% strikes

        def extract(df, side):
            df = df[df["strike"].between(lo, hi)].copy()
            rows = []
            for _, row in df.iterrows():
                strike = _safe_float(row.get("strike"), 2)
                iv     = _safe_float(row.get("impliedVolatility"), 4)
                vol    = _safe_int(row.get("volume"))
                oi     = _safe_int(row.get("openInterest"))
                if strike and iv and iv < 5.0:  # filter absurd IV values
                    rows.append({"strike": strike, "iv": iv, "iv_pct": round(iv * 100, 1), "volume": vol, "oi": oi})
            return sorted(rows, key=lambda x: x["strike"])

        calls = extract(chain.calls, "call")
        puts  = extract(chain.puts,  "put")

        # Merge by strike
        call_map = {c["strike"]: c["iv_pct"] for c in calls}
        put_map  = {p["strike"]: p["iv_pct"] for p in puts}
        all_strikes = sorted(set(call_map) | set(put_map))

        skew_points = []
        for s in all_strikes:
            skew_points.append({
                "strike":   s,
                "call_iv":  call_map.get(s),
                "put_iv":   put_map.get(s),
                "moneyness": round((s - S) / S * 100, 1),  # % from spot
            })

        # 25-delta skew proxy: put IV at 10% OTM vs call IV at 10% OTM
        otm_put_iv  = next((p["put_iv"]  for p in skew_points if p["moneyness"] < -8), None)
        otm_call_iv = next((p["call_iv"] for p in skew_points if p["moneyness"] > 8), None)
        skew_25d = round(otm_put_iv - otm_call_iv, 1) if otm_put_iv and otm_call_iv else None

        atm = _atm_iv(chain.calls, S)

        return {
            "expiration": exp,
            "dte":        _dte(exp),
            "label":      datetime.strptime(exp, "%Y-%m-%d").strftime("%b %d"),
            "atm_iv_pct": round(atm * 100, 1) if atm else None,
            "skew_25d":   skew_25d,
            "points":     skew_points,
        }
    except Exception as e:
        logger.debug(f"Skew error {exp}: {e}")
        return None


def get_skew(ticker: str, max_expirations: int = 8) -> dict:
    key = f"options:skew:{ticker.upper()}"
    cached = _cache.get(key, CACHE_TTL)
    if cached:
        return cached

    t = yf.Ticker(ticker.upper())
    spot_df = t.history(period="1d", auto_adjust=True)
    S = float(spot_df["Close"].iloc[-1]) if not spot_df.empty else None
    if S is None:
        return {"error": "Could not fetch spot price"}

    try:
        expirations = t.options[:max_expirations]
    except Exception:
        return {"error": "No options data"}

    term_structure = []
    skew_by_exp    = {}

    for exp in expirations:
        data = _skew_for_expiration(t, exp, S)
        if data:
            term_structure.append({
                "expiration": exp,
                "label":      data["label"],
                "dte":        data["dte"],
                "atm_iv_pct": data["atm_iv_pct"],
                "skew_25d":   data["skew_25d"],
            })
            skew_by_exp[exp] = data

    result = {
        "ticker":          ticker.upper(),
        "spot_price":      round(S, 2),
        "term_structure":  term_structure,
        "skew_by_exp":     skew_by_exp,
    }
    _cache.set(key, result)
    return result
