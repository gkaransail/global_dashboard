"""
Options-based signals: put/call ratio, unusual call/put activity, IV skew.
Score range: -1.0 (bearish) to +1.0 (bullish).
"""
import logging
import yfinance as yf

logger = logging.getLogger(__name__)


def score(ticker: str) -> dict:
    """Returns options signal score and breakdown."""
    try:
        t = yf.Ticker(ticker)
        exps = t.options
        if not exps:
            return _empty()

        # Use nearest expiry (most liquid, most responsive to current sentiment)
        chain = t.option_chain(exps[0])
        calls = chain.calls
        puts = chain.puts

        if calls.empty or puts.empty:
            return _empty()

        call_vol = float(calls["volume"].fillna(0).sum())
        put_vol  = float(puts["volume"].fillna(0).sum())
        call_oi  = float(calls["openInterest"].fillna(0).sum())
        put_oi   = float(puts["openInterest"].fillna(0).sum())

        total_vol = call_vol + put_vol
        if total_vol < 100:
            return _empty()

        # Put/call volume ratio
        pcr = put_vol / call_vol if call_vol > 0 else 2.0

        # Unusual activity: any strike with volume > 3x its OI = big directional bet
        calls["vol_oi"] = calls.apply(
            lambda r: r["volume"] / r["openInterest"]
            if r["openInterest"] > 0 and r["volume"] > 0 else 0, axis=1
        )
        puts["vol_oi"] = puts.apply(
            lambda r: r["volume"] / r["openInterest"]
            if r["openInterest"] > 0 and r["volume"] > 0 else 0, axis=1
        )

        unusual_calls = float((calls["vol_oi"] > 3).sum())
        unusual_puts  = float((puts["vol_oi"] > 3).sum())

        # IV skew: compare average OTM put IV vs OTM call IV
        # OTM = puts below spot, calls above spot
        try:
            spot = float(t.fast_info.last_price)
            otm_puts  = puts[puts["strike"] < spot * 0.98]["impliedVolatility"].mean()
            otm_calls = calls[calls["strike"] > spot * 1.02]["impliedVolatility"].mean()
            skew = float(otm_puts - otm_calls) if otm_puts and otm_calls else 0.0
        except Exception:
            skew = 0.0

        # --- Scoring ---

        # PCR score: low PCR = calls dominating = bullish
        if pcr < 0.5:
            pcr_score = 1.0
        elif pcr < 0.7:
            pcr_score = 0.6
        elif pcr < 0.9:
            pcr_score = 0.2
        elif pcr < 1.1:
            pcr_score = -0.1
        elif pcr < 1.4:
            pcr_score = -0.5
        else:
            pcr_score = -1.0

        # Unusual activity score
        unusual_score = min(unusual_calls * 0.15, 0.4) - min(unusual_puts * 0.15, 0.4)

        # Skew score: negative skew (puts cheaper) = bullish
        if skew > 0.15:
            skew_score = -0.4
        elif skew > 0.05:
            skew_score = -0.15
        elif skew < -0.05:
            skew_score = 0.15
        else:
            skew_score = 0.0

        composite = (pcr_score * 0.6) + (unusual_score * 0.25) + (skew_score * 0.15)
        composite = max(-1.0, min(1.0, composite))

        reasons = []
        if pcr < 0.7:
            reasons.append(f"PCR {pcr:.2f} — heavy call buying")
        elif pcr > 1.3:
            reasons.append(f"PCR {pcr:.2f} — heavy put buying")
        if unusual_calls > 2:
            reasons.append(f"{int(unusual_calls)} unusual call strikes")
        if unusual_puts > 2:
            reasons.append(f"{int(unusual_puts)} unusual put strikes")
        if skew > 0.1:
            reasons.append("Elevated put skew")

        return {
            "score": round(composite, 3),
            "pcr": round(pcr, 2),
            "call_volume": int(call_vol),
            "put_volume": int(put_vol),
            "unusual_calls": int(unusual_calls),
            "unusual_puts": int(unusual_puts),
            "iv_skew": round(skew, 3),
            "reasons": reasons,
        }
    except Exception as e:
        logger.debug(f"Options signal failed for {ticker}: {e}")
        return _empty()


def _empty():
    return {"score": 0.0, "pcr": None, "call_volume": 0, "put_volume": 0,
            "unusual_calls": 0, "unusual_puts": 0, "iv_skew": None, "reasons": []}
