"""
Options market analysis: expected move, max pain, key OI levels, narrative.
Timeframe-aware: filters expirations to match selected timeframe window.
Includes IV Rank and IV Percentile using 1-year rolling HV as proxy.
"""
import math
import logging
import numpy as np
from datetime import datetime, date, timedelta
from typing import Optional
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)
CACHE_TTL = 180


def timeframe_to_days(timeframe: str) -> int:
    # Maps timeframe key → target DTE for expiration selection
    mapping = {
        "1h":  1,
        "1d":  3,
        "1w":  7,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y":  365,
        "5y":  730,
        "all": 730,
    }
    return mapping.get(timeframe, 90)


def _get_spot(ticker: str) -> float:
    t = yf.Ticker(ticker)
    info = t.fast_info
    return float(info.last_price)


def _get_expirations(ticker: str) -> list[dict]:
    t = yf.Ticker(ticker)
    today = date.today()
    exps = []
    for exp_str in (t.options or []):
        try:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            if dte < 0:
                continue
            exps.append({"date": exp_str, "dte": dte})
        except Exception:
            continue
    return sorted(exps, key=lambda x: x["dte"])


def _pick_best_expiration(exps: list[dict], target_dte: int) -> Optional[dict]:
    """Pick expiration closest to target_dte, must be > 3 days out."""
    candidates = [e for e in exps if e["dte"] >= 3]
    if not candidates:
        return None
    # Prefer the one closest to target_dte
    return min(candidates, key=lambda e: abs(e["dte"] - target_dte))


def _filter_expirations(exps: list[dict], max_dte: int) -> list[dict]:
    """Return exps with dte <= max_dte (keep at least 3 if none qualify)."""
    filtered = [e for e in exps if e["dte"] <= max_dte]
    if len(filtered) < 3:
        filtered = exps[:min(3, len(exps))]
    return filtered


def calc_expected_move(spot: float, atm_iv: float, dte: int) -> dict:
    """
    1SD expected move = spot * IV * sqrt(T), where T = dte/365.
    Gives the market's implied ±1 standard deviation range.
    """
    T = dte / 365.0
    move_dollar = round(spot * atm_iv * math.sqrt(T), 2)
    move_pct = round(atm_iv * math.sqrt(T) * 100, 2)
    return {
        "upper": round(spot + move_dollar, 2),
        "lower": round(spot - move_dollar, 2),
        "move_dollar": move_dollar,
        "move_pct": move_pct,
    }


def calc_max_pain(chain_data: dict) -> Optional[float]:
    """
    Max pain: strike where total option holder losses are maximized
    (i.e., where market makers pay least).
    For each strike, compute total intrinsic value of all calls + puts at that price.
    Max pain = strike with minimum total payout.
    """
    calls = chain_data.get("calls", [])
    puts = chain_data.get("puts", [])
    if not calls or not puts:
        return None

    call_map = {c["strike"]: c.get("oi", 0) or 0 for c in calls}
    put_map  = {p["strike"]: p.get("oi", 0) or 0 for p in puts}
    all_strikes = sorted(set(list(call_map.keys()) + list(put_map.keys())))

    min_pain = None
    max_pain_strike = None

    for test_strike in all_strikes:
        call_pain = sum(
            max(0.0, test_strike - s) * oi
            for s, oi in call_map.items()
        )
        put_pain = sum(
            max(0.0, s - test_strike) * oi
            for s, oi in put_map.items()
        )
        total = call_pain + put_pain
        if min_pain is None or total < min_pain:
            min_pain = total
            max_pain_strike = test_strike

    return max_pain_strike


def find_key_levels(calls: list, puts: list, spot: float) -> list[dict]:
    """
    Identify strikes with unusually high OI that act as support/resistance.
    Returns top 5 call OI (resistance) and top 5 put OI (support) strikes.
    """
    levels = []

    if calls:
        call_sorted = sorted(calls, key=lambda c: c.get("oi", 0) or 0, reverse=True)
        total_call_oi = sum(c.get("oi", 0) or 0 for c in calls) or 1
        for c in call_sorted[:5]:
            oi = c.get("oi", 0) or 0
            if oi < 100:
                continue
            levels.append({
                "strike": c["strike"],
                "oi": oi,
                "type": "call",
                "role": "resistance",
                "pct_from_spot": round((c["strike"] - spot) / spot * 100, 1),
                "significance": round(oi / total_call_oi * 100, 1),
            })

    if puts:
        put_sorted = sorted(puts, key=lambda p: p.get("oi", 0) or 0, reverse=True)
        total_put_oi = sum(p.get("oi", 0) or 0 for p in puts) or 1
        for p in put_sorted[:5]:
            oi = p.get("oi", 0) or 0
            if oi < 100:
                continue
            levels.append({
                "strike": p["strike"],
                "oi": oi,
                "type": "put",
                "role": "support",
                "pct_from_spot": round((p["strike"] - spot) / spot * 100, 1),
                "significance": round(oi / total_put_oi * 100, 1),
            })

    return sorted(levels, key=lambda l: abs(l["pct_from_spot"]))


def generate_narrative(
    ticker: str, spot: float, pc_ratio: float, atm_iv: float,
    expected_move: dict, max_pain: Optional[float], key_levels: list,
    selected_dte: int, timeframe: str,
) -> str:
    lines = []

    # Sentiment from P/C ratio
    if pc_ratio > 1.3:
        sent = "bearish — put buying dominates, suggesting hedging or directional downside bets"
    elif pc_ratio > 1.0:
        sent = "mildly bearish — slight put dominance in positioning"
    elif pc_ratio > 0.7:
        sent = "neutral with slight bullish lean — balanced options activity"
    else:
        sent = "bullish — call buying dominates, reflecting upside positioning"

    lines.append(f"Options flow for {ticker} is {sent} (P/C OI ratio: {pc_ratio:.2f}).")

    # Expected move
    em = expected_move
    lines.append(
        f"The market is pricing in a ±{em['move_pct']}% (±${em['move_dollar']}) move "
        f"by the {selected_dte}-day expiration, implying a range of ${em['lower']}–${em['upper']}."
    )

    # Max pain
    if max_pain:
        mp_pct = round((max_pain - spot) / spot * 100, 1)
        direction = "above" if max_pain > spot else "below"
        lines.append(
            f"Max pain sits at ${max_pain} ({abs(mp_pct)}% {direction} spot), "
            "the level where option sellers face minimum losses — price often gravitates here near expiry."
        )

    # Key levels
    resistance = [l for l in key_levels if l["role"] == "resistance"]
    support    = [l for l in key_levels if l["role"] == "support"]

    if resistance:
        top_r = resistance[0]
        lines.append(
            f"Strongest call OI wall (resistance) is at ${top_r['strike']} "
            f"({top_r['pct_from_spot']:+.1f}% from spot, {top_r['oi']:,} contracts)."
        )

    if support:
        top_s = support[0]
        lines.append(
            f"Largest put OI cluster (support) is at ${top_s['strike']} "
            f"({top_s['pct_from_spot']:+.1f}% from spot, {top_s['oi']:,} contracts)."
        )

    # IV level context
    if atm_iv > 0.60:
        lines.append(f"ATM IV of {atm_iv*100:.0f}% is elevated — options are expensive, suggesting the market expects a significant event or high uncertainty.")
    elif atm_iv > 0.35:
        lines.append(f"ATM IV of {atm_iv*100:.0f}% is moderate — normal uncertainty priced into the move.")
    else:
        lines.append(f"ATM IV of {atm_iv*100:.0f}% is low — options are cheap, market expects a quiet period.")

    return " ".join(lines)


def calc_iv_rank(ticker: str, current_iv: float) -> dict:
    """
    IV Rank = (current IV - 52w low HV) / (52w high HV - 52w low HV) × 100
    IV Percentile = % of trading days in past year where HV was below current IV
    Uses 30-day rolling historical volatility as a proxy for implied volatility.
    """
    cache_key = f"iv_rank_{ticker}"
    cached = _cache.get(cache_key, ttl=3600)
    if cached:
        cached["current_iv_pct"] = round(current_iv * 100, 1)
        return cached

    try:
        df = yf.Ticker(ticker).history(period="1y", interval="1d", auto_adjust=True)
        if df is None or len(df) < 30:
            return {"iv_rank": None, "iv_percentile": None, "iv_52w_low": None, "iv_52w_high": None}

        log_returns = np.log(df["Close"] / df["Close"].shift(1)).dropna()
        hv_series = log_returns.rolling(window=21).std() * math.sqrt(252)
        hv_series = hv_series.dropna()

        if len(hv_series) < 10:
            return {"iv_rank": None, "iv_percentile": None, "iv_52w_low": None, "iv_52w_high": None}

        hv_low  = float(hv_series.min())
        hv_high = float(hv_series.max())
        iv_rank = round(((current_iv - hv_low) / (hv_high - hv_low)) * 100, 1) if hv_high > hv_low else 50.0
        iv_rank = max(0.0, min(100.0, iv_rank))
        iv_percentile = round(float((hv_series < current_iv).mean()) * 100, 1)

        result = {
            "iv_rank": iv_rank,
            "iv_percentile": iv_percentile,
            "iv_52w_low": round(hv_low * 100, 1),
            "iv_52w_high": round(hv_high * 100, 1),
            "current_iv_pct": round(current_iv * 100, 1),
        }
        _cache.set(cache_key, result)
        return result
    except Exception as e:
        logger.debug(f"IV rank calc failed for {ticker}: {e}")
        return {"iv_rank": None, "iv_percentile": None, "iv_52w_low": None, "iv_52w_high": None}


def get_analysis(ticker: str, timeframe: str = "3mo") -> dict:
    cache_key = f"options_analysis_{ticker}_{timeframe}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    ticker = ticker.upper()
    max_dte = timeframe_to_days(timeframe)

    # Get spot price
    try:
        spot = _get_spot(ticker)
    except Exception as e:
        raise RuntimeError(f"Cannot fetch spot price for {ticker}: {e}")

    # Get all expirations
    all_exps = _get_expirations(ticker)
    if not all_exps:
        raise RuntimeError(f"No options data found for {ticker}")

    # Filter to timeframe and pick best expiration
    filtered_exps = _filter_expirations(all_exps, max_dte)
    target_dte = max(7, int(max_dte * 0.75))  # aim for ~75% of the timeframe window
    best_exp = _pick_best_expiration(filtered_exps, target_dte)
    if not best_exp:
        best_exp = filtered_exps[0]

    # Fetch full chain for best expiration
    t = yf.Ticker(ticker)
    try:
        opt = t.option_chain(best_exp["date"])
    except Exception as e:
        raise RuntimeError(f"Cannot fetch chain for {best_exp['date']}: {e}")

    raw_calls = opt.calls.to_dict("records") if opt.calls is not None else []
    raw_puts  = opt.puts.to_dict("records")  if opt.puts  is not None else []

    def _safe_int(v):
        try:
            f = float(v)
            return 0 if (f != f) else int(f)  # f != f catches NaN
        except (TypeError, ValueError):
            return 0

    def _safe_float(v):
        try:
            f = float(v)
            return None if (f != f) else f
        except (TypeError, ValueError):
            return None

    def parse_contracts(rows, opt_type):
        out = []
        for r in rows:
            strike = _safe_float(r.get("strike", 0)) or 0.0
            if strike <= 0:
                continue
            iv = _safe_float(r.get("impliedVolatility"))
            oi = _safe_int(r.get("openInterest", 0))
            vol = _safe_int(r.get("volume", 0))
            out.append({
                "strike": strike,
                "iv": iv,
                "oi": oi,
                "volume": vol,
                "type": opt_type,
            })
        return out

    calls = parse_contracts(raw_calls, "call")
    puts  = parse_contracts(raw_puts,  "put")

    # ATM IV: nearest call IV to spot
    atm_iv = None
    if calls:
        atm_call = min(calls, key=lambda c: abs(c["strike"] - spot))
        atm_iv = atm_call.get("iv")

    # P/C ratio
    total_call_oi = sum(c["oi"] for c in calls)
    total_put_oi  = sum(p["oi"] for p in puts)
    pc_ratio = round(total_put_oi / total_call_oi, 3) if total_call_oi > 0 else None

    # Expected move
    expected_move = None
    if atm_iv and atm_iv > 0:
        expected_move = calc_expected_move(spot, atm_iv, best_exp["dte"])

    # Max pain (use all strikes)
    chain_for_pain = {"calls": calls, "puts": puts}
    max_pain = calc_max_pain(chain_for_pain)

    # Key OI levels
    key_levels = find_key_levels(calls, puts, spot)

    # Expiration label
    exp_label = datetime.strptime(best_exp["date"], "%Y-%m-%d").strftime("%b %d")

    # Narrative
    narrative = None
    if atm_iv and pc_ratio and expected_move:
        try:
            narrative = generate_narrative(
                ticker=ticker,
                spot=spot,
                pc_ratio=pc_ratio,
                atm_iv=atm_iv,
                expected_move=expected_move,
                max_pain=max_pain,
                key_levels=key_levels,
                selected_dte=best_exp["dte"],
                timeframe=timeframe,
            )
        except Exception as e:
            logger.warning(f"Narrative generation failed: {e}")

    iv_rank_data = calc_iv_rank(ticker, atm_iv) if atm_iv else {}

    result = {
        "ticker": ticker,
        "timeframe": timeframe,
        "spot_price": round(spot, 2),
        "selected_expiration": {
            "date": best_exp["date"],
            "label": exp_label,
            "dte": best_exp["dte"],
        },
        "available_expirations": [
            {"date": e["date"], "dte": e["dte"]} for e in filtered_exps
        ],
        "atm_iv_pct": round(atm_iv * 100, 1) if atm_iv else None,
        "iv_rank": iv_rank_data.get("iv_rank"),
        "iv_percentile": iv_rank_data.get("iv_percentile"),
        "iv_52w_low": iv_rank_data.get("iv_52w_low"),
        "iv_52w_high": iv_rank_data.get("iv_52w_high"),
        "pc_ratio": pc_ratio,
        "total_call_oi": total_call_oi,
        "total_put_oi": total_put_oi,
        "expected_move": expected_move,
        "max_pain": max_pain,
        "key_levels": key_levels[:10],
        "narrative": narrative,
    }

    _cache.set(cache_key, result)
    return result
