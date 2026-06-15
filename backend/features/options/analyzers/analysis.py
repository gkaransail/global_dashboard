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
CACHE_TTL = 600  # 10 min — reduces Yahoo Finance rate-limit hits


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
    # fast_info is the lightest call; fall back to recent history if it's rate-limited
    try:
        price = t.fast_info.last_price
        if price and not (isinstance(price, float) and math.isnan(price)):
            return float(price)
    except Exception:
        pass
    hist = t.history(period="5d", interval="1d", auto_adjust=True)
    if not hist.empty:
        return float(hist["Close"].iloc[-1])
    raise RuntimeError(f"Cannot fetch spot price for {ticker} — Yahoo Finance may be rate-limiting. Try again in a moment.")


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


def calc_max_pain(chain_data: dict, spot: float) -> Optional[float]:
    """
    Max pain: strike where total option holder losses are maximized.
    Filtered to ±40% of spot to exclude LEAPS / deep-OTM contracts that
    distort the calculation when spot is far from historical strike ranges.
    """
    calls = chain_data.get("calls", [])
    puts  = chain_data.get("puts", [])
    if not calls or not puts:
        return None

    lo, hi = spot * 0.60, spot * 1.40
    call_map = {c["strike"]: c.get("oi", 0) or 0 for c in calls if lo <= c["strike"] <= hi}
    put_map  = {p["strike"]: p.get("oi", 0) or 0 for p in puts  if lo <= p["strike"] <= hi}
    all_strikes = sorted(set(list(call_map.keys()) + list(put_map.keys())))

    if not all_strikes:
        # No strikes in range — fall back to unfiltered
        call_map = {c["strike"]: c.get("oi", 0) or 0 for c in calls}
        put_map  = {p["strike"]: p.get("oi", 0) or 0 for p in puts}
        all_strikes = sorted(set(list(call_map.keys()) + list(put_map.keys())))

    min_pain = None
    max_pain_strike = None

    for test_strike in all_strikes:
        call_pain = sum(max(0.0, test_strike - s) * oi for s, oi in call_map.items())
        put_pain  = sum(max(0.0, s - test_strike) * oi for s, oi in put_map.items())
        total = call_pain + put_pain
        if min_pain is None or total < min_pain:
            min_pain = total
            max_pain_strike = test_strike

    return max_pain_strike


def find_key_levels(calls: list, puts: list, spot: float) -> list[dict]:
    """
    Identify strikes with high OI that act as support/resistance.
    Role is determined by position relative to spot — NOT by option type:
      - Call OI above spot → resistance (market makers short calls, hedge by selling)
      - Call OI below spot → support (deep ITM calls create a price floor)
      - Put OI below spot → support (market makers short puts, hedge by buying)
      - Put OI above spot → resistance (deep ITM puts create a ceiling)
    """
    levels = []

    if calls:
        call_sorted = sorted(calls, key=lambda c: c.get("oi", 0) or 0, reverse=True)
        total_call_oi = sum(c.get("oi", 0) or 0 for c in calls) or 1
        for c in call_sorted[:5]:
            oi = c.get("oi", 0) or 0
            if oi < 100:
                continue
            strike = c["strike"]
            pct = round((strike - spot) / spot * 100, 1)
            role = "resistance" if strike >= spot else "support"
            levels.append({
                "strike": strike,
                "oi": oi,
                "type": "call",
                "role": role,
                "pct_from_spot": pct,
                "significance": round(oi / total_call_oi * 100, 1),
            })

    if puts:
        put_sorted = sorted(puts, key=lambda p: p.get("oi", 0) or 0, reverse=True)
        total_put_oi = sum(p.get("oi", 0) or 0 for p in puts) or 1
        for p in put_sorted[:5]:
            oi = p.get("oi", 0) or 0
            if oi < 100:
                continue
            strike = p["strike"]
            pct = round((strike - spot) / spot * 100, 1)
            role = "support" if strike <= spot else "resistance"
            levels.append({
                "strike": strike,
                "oi": oi,
                "type": "put",
                "role": role,
                "pct_from_spot": pct,
                "significance": round(oi / total_put_oi * 100, 1),
            })

    return sorted(levels, key=lambda l: abs(l["pct_from_spot"]))


def generate_narrative(
    ticker: str, spot: float, pc_ratio: float, pc_vol_ratio: Optional[float],
    atm_iv: float, expected_move: dict, max_pain: Optional[float],
    key_levels: list, selected_dte: int, timeframe: str,
    pc_atm_ratio: Optional[float] = None,
) -> str:
    lines = []

    # Signal priority:
    # 1. ATM P/C OI — near-money only, strips far-OTM portfolio hedges → best near-term read
    # 2. Overall P/C Volume — today's live flow across all strikes
    # 3. Overall P/C OI — accumulated historical positioning (slowest signal)
    if pc_atm_ratio is not None:
        primary_ratio = pc_atm_ratio
        primary_label = "ATM positioning"
    elif pc_vol_ratio is not None:
        primary_ratio = pc_vol_ratio
        primary_label = "flow (volume)"
    else:
        primary_ratio = pc_ratio
        primary_label = "positioning (OI)"

    if primary_ratio > 1.3:
        sent = f"bearish — put {primary_label} dominates near the money"
    elif primary_ratio > 1.0:
        sent = f"mildly bearish — slight put dominance in {primary_label}"
    elif primary_ratio > 0.7:
        sent = f"neutral — balanced {primary_label}"
    else:
        sent = f"bullish — call {primary_label} dominates near the money, reflecting upside positioning"

    # Flag when ATM (near-money) diverges from the overall flow (which can be distorted by far-OTM hedges)
    context_notes = []
    if pc_atm_ratio is not None and pc_vol_ratio is not None:
        atm_sent = "bearish" if pc_atm_ratio > 1.0 else "bullish"
        vol_sent = "bearish" if pc_vol_ratio > 1.0 else "bullish"
        if atm_sent != vol_sent:
            context_notes.append(
                f"Note: overall volume flow is {vol_sent} (P/C vol: {pc_vol_ratio:.2f}) but near-money (ATM) "
                f"positioning is {atm_sent} (P/C ATM: {pc_atm_ratio:.2f}) — far-OTM puts (portfolio hedges) "
                f"are distorting the overall ratio; ATM is the cleaner directional signal."
            )
    elif pc_vol_ratio is not None and pc_ratio is not None:
        oi_sent  = "bearish" if pc_ratio > 1.0 else "bullish"
        vol_sent = "bearish" if pc_vol_ratio > 1.0 else "bullish"
        if oi_sent != vol_sent:
            context_notes.append(
                f"Note: OI is {oi_sent} (P/C OI: {pc_ratio:.2f}) but today's volume is {vol_sent} "
                f"(P/C vol: {pc_vol_ratio:.2f}) — volume is the more current signal."
            )

    ratio_label = f"P/C ATM: {pc_atm_ratio:.2f}" if pc_atm_ratio is not None else f"P/C vol: {primary_ratio:.2f}"
    conflict_str = " " + " ".join(context_notes) if context_notes else ""
    lines.append(f"Options flow for {ticker} is {sent} ({ratio_label}).{conflict_str}")

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

    # OI-based P/C (accumulated historical positioning)
    total_call_oi  = sum(c["oi"] for c in calls)
    total_put_oi   = sum(p["oi"] for p in puts)
    pc_ratio = round(total_put_oi / total_call_oi, 3) if total_call_oi > 0 else None

    # Volume-based P/C (today's live flow — more current signal)
    total_call_vol = sum(c.get("volume") or 0 for c in calls)
    total_put_vol  = sum(p.get("volume") or 0 for p in puts)
    pc_vol_ratio = round(total_put_vol / total_call_vol, 3) if total_call_vol > 0 else None

    # ATM P/C (±10% of spot — near-money only, less distorted by deep OTM)
    atm_calls = [c for c in calls if spot * 0.90 <= c["strike"] <= spot * 1.10]
    atm_puts  = [p for p in puts  if spot * 0.90 <= p["strike"] <= spot * 1.10]
    atm_call_oi = sum(c["oi"] for c in atm_calls)
    atm_put_oi  = sum(p["oi"] for p in atm_puts)
    pc_atm_ratio = round(atm_put_oi / atm_call_oi, 3) if atm_call_oi > 0 else None

    # Expected move
    expected_move = None
    if atm_iv and atm_iv > 0:
        expected_move = calc_expected_move(spot, atm_iv, best_exp["dte"])

    # Max pain — filtered to ±40% of spot to exclude LEAPS distortion
    chain_for_pain = {"calls": calls, "puts": puts}
    max_pain = calc_max_pain(chain_for_pain, spot)

    # Key OI levels — role now based on position relative to spot
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
                pc_vol_ratio=pc_vol_ratio,
                atm_iv=atm_iv,
                expected_move=expected_move,
                max_pain=max_pain,
                key_levels=key_levels,
                selected_dte=best_exp["dte"],
                timeframe=timeframe,
                pc_atm_ratio=pc_atm_ratio,
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
        "pc_vol_ratio": pc_vol_ratio,
        "pc_atm_ratio": pc_atm_ratio,
        "total_call_oi": total_call_oi,
        "total_put_oi": total_put_oi,
        "total_call_vol": total_call_vol,
        "total_put_vol": total_put_vol,
        "expected_move": expected_move,
        "max_pain": max_pain,
        "key_levels": key_levels[:10],
        "narrative": narrative,
    }

    _cache.set(cache_key, result)
    return result
