"""
Options chain fetcher + Black-Scholes Greeks calculator.
No scipy needed — uses math.erf for normal CDF.
"""
import math
import logging
from datetime import datetime, date
from typing import Optional
import pandas as pd
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)
CACHE_TTL = 300  # 5 min — reduces Yahoo Finance rate-limit hits
RISK_FREE_RATE = 0.045  # 4.5% — approximate 3-month T-bill


# ── Black-Scholes helpers ─────────────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def calc_greeks(S: float, K: float, T: float, sigma: float, option_type: str, r: float = RISK_FREE_RATE) -> dict:
    """
    Returns delta, gamma, theta (per day), vega (per 1% IV move).
    Returns None fields when inputs are degenerate.
    """
    if T <= 1e-6 or sigma <= 1e-6 or S <= 0 or K <= 0:
        return {"delta": None, "gamma": None, "theta": None, "vega": None}
    try:
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        pdf_d1 = _norm_pdf(d1)
        exp_rT = math.exp(-r * T)

        if option_type == "call":
            delta = _norm_cdf(d1)
            theta = (-(S * pdf_d1 * sigma) / (2 * math.sqrt(T))
                     - r * K * exp_rT * _norm_cdf(d2)) / 365
        else:
            delta = _norm_cdf(d1) - 1.0
            theta = (-(S * pdf_d1 * sigma) / (2 * math.sqrt(T))
                     + r * K * exp_rT * _norm_cdf(-d2)) / 365

        gamma = pdf_d1 / (S * sigma * math.sqrt(T))
        vega  = S * pdf_d1 * math.sqrt(T) / 100.0

        return {
            "delta": round(delta, 3),
            "gamma": round(gamma, 5),
            "theta": round(theta, 3),
            "vega":  round(vega,  3),
        }
    except Exception as e:
        logger.debug(f"Greeks error S={S} K={K} T={T} σ={sigma}: {e}")
        return {"delta": None, "gamma": None, "theta": None, "vega": None}


# ── Data helpers ──────────────────────────────────────────────────────────

def _dte(exp_str: str) -> int:
    return max(0, (datetime.strptime(exp_str, "%Y-%m-%d").date() - date.today()).days)


def _safe_float(val, decimals: int = 2) -> Optional[float]:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, decimals)
    except Exception:
        return None


def _safe_int(val) -> int:
    try:
        f = float(val)
        return 0 if (math.isnan(f) or math.isinf(f)) else int(f)
    except Exception:
        return 0


def _process_side(df: pd.DataFrame, option_type: str, S: float, T: float) -> list[dict]:
    rows = []
    for _, row in df.iterrows():
        strike = _safe_float(row.get("strike"), 2)
        iv     = _safe_float(row.get("impliedVolatility"), 4)
        last   = _safe_float(row.get("lastPrice"), 2)
        bid    = _safe_float(row.get("bid"), 2)
        ask    = _safe_float(row.get("ask"), 2)
        vol    = _safe_int(row.get("volume"))
        oi     = _safe_int(row.get("openInterest"))
        itm    = bool(row.get("inTheMoney", False))

        if strike is None:
            continue

        mid = round((bid + ask) / 2, 2) if bid is not None and ask is not None else last
        vol_oi = round(vol / oi, 2) if oi > 0 and vol > 0 else None

        greeks = calc_greeks(S, strike, T, iv or 0.0, option_type) if iv else \
                 {"delta": None, "gamma": None, "theta": None, "vega": None}

        # Intrinsic / extrinsic
        intrinsic = max(0.0, (S - strike) if option_type == "call" else (strike - S))
        extrinsic = round((mid or 0) - intrinsic, 2) if mid is not None else None

        rows.append({
            "strike":      strike,
            "last":        last,
            "bid":         bid,
            "ask":         ask,
            "mid":         mid,
            "iv":          iv,
            "iv_pct":      round(iv * 100, 1) if iv else None,
            "volume":      vol,
            "oi":          oi,
            "vol_oi":      vol_oi,
            "itm":         itm,
            "intrinsic":   round(intrinsic, 2),
            "extrinsic":   extrinsic,
            "delta":       greeks["delta"],
            "gamma":       greeks["gamma"],
            "theta":       greeks["theta"],
            "vega":        greeks["vega"],
        })
    return rows


# ── Public API ────────────────────────────────────────────────────────────

def get_expirations(ticker: str) -> dict:
    key = f"options:exps:{ticker.upper()}"
    cached = _cache.get(key, CACHE_TTL)
    if cached:
        return cached

    t = yf.Ticker(ticker.upper())
    try:
        spot_df = t.history(period="1d", auto_adjust=True)
        spot = float(spot_df["Close"].iloc[-1]) if not spot_df.empty else None
    except Exception as e:
        logger.warning(f"Expirations history fetch failed for {ticker}: {e}")
        spot = None

    try:
        raw_exps = t.options  # tuple of date strings
    except Exception:
        raw_exps = ()

    expirations = []
    for exp in raw_exps:
        dte = _dte(exp)
        dt  = datetime.strptime(exp, "%Y-%m-%d")
        expirations.append({
            "date":  exp,
            "dte":   dte,
            "label": f"{dt.strftime('%b %d')} ({dte}d)",
            "weekly": dte <= 10,
        })

    result = {"ticker": ticker.upper(), "spot_price": spot, "expirations": expirations}
    _cache.set(key, result)
    return result


def get_chain(ticker: str, expiration: str, strike_range: float = 0.25) -> dict:
    key = f"options:chain:{ticker.upper()}:{expiration}"
    cached = _cache.get(key, CACHE_TTL)
    if cached:
        return cached

    t = yf.Ticker(ticker.upper())

    try:
        raw = t.option_chain(expiration)
    except Exception as e:
        raise ValueError(f'Could not fetch options chain for {ticker.upper()} ({expiration}): {e}')

    try:
        spot_df = t.history(period="1d", auto_adjust=True)
        S = float(spot_df["Close"].iloc[-1]) if not spot_df.empty else None
    except Exception:
        S = None
    if S is None:
        raise ValueError(f'Could not fetch spot price for "{ticker.upper()}". The ticker may be delisted or invalid.')

    dte = _dte(expiration)
    T   = max(dte / 365.0, 1 / 365.0)

    # Filter strikes to ±strike_range of spot
    lo, hi = S * (1 - strike_range), S * (1 + strike_range)
    calls_df = raw.calls[raw.calls["strike"].between(lo, hi)].reset_index(drop=True)
    puts_df  = raw.puts [raw.puts ["strike"].between(lo, hi)].reset_index(drop=True)

    calls = _process_side(calls_df, "call", S, T)
    puts  = _process_side(puts_df,  "put",  S, T)

    # Summary stats
    total_call_oi = sum(c["oi"] for c in calls)
    total_put_oi  = sum(p["oi"] for p in puts)
    total_call_vol = sum(c["volume"] for c in calls)
    total_put_vol  = sum(p["volume"] for p in puts)
    pc_oi_ratio   = round(total_put_oi  / total_call_oi,  2) if total_call_oi  else None
    pc_vol_ratio  = round(total_put_vol / total_call_vol, 2) if total_call_vol else None

    # ATM IV (nearest strike to spot)
    atm_call = min(calls, key=lambda c: abs(c["strike"] - S), default=None) if calls else None
    atm_iv   = atm_call["iv_pct"] if atm_call else None

    result = {
        "ticker":      ticker.upper(),
        "spot_price":  round(S, 2),
        "expiration":  expiration,
        "dte":         dte,
        "calls":       calls,
        "puts":        puts,
        "summary": {
            "total_call_oi":  total_call_oi,
            "total_put_oi":   total_put_oi,
            "total_call_vol": total_call_vol,
            "total_put_vol":  total_put_vol,
            "pc_oi_ratio":    pc_oi_ratio,
            "pc_vol_ratio":   pc_vol_ratio,
            "atm_iv_pct":     atm_iv,
        },
    }
    _cache.set(key, result)
    return result
