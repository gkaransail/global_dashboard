"""
Smart Money Scanner — scans a stock universe and scores each ticker on
options flow, insider activity, and institutional positioning.

Weights:
  Options:      40%  (real-time sentiment, most responsive)
  Insider:      35%  (strongest forward-looking signal)
  Institutional: 25% (trend confirmation)
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional
import yfinance as yf
from core import cache as _cache
from features.smart_money.signals import options as opt_sig
from features.smart_money.signals import insider as ins_sig
from features.smart_money.signals import institution as inst_sig

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour — institutional/insider data is slow-moving
MAX_WORKERS = 12

UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    # Semiconductors
    "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "KLAC",
    # Software / Cloud
    "CRM", "ORCL", "NOW", "ADBE", "PLTR", "SNOW",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "V", "MA", "AXP",
    # Healthcare / Pharma
    "JNJ", "PFE", "ABBV", "UNH", "LLY", "AMGN", "GILD", "MRNA",
    # Energy
    "XOM", "CVX", "COP", "SLB", "OXY",
    # Consumer
    "HD", "MCD", "COST", "TGT", "WMT", "NKE", "SBUX",
    # Industrial / Defense
    "BA", "CAT", "GE", "HON", "LMT", "RTX",
    # Media / Streaming
    "NFLX", "DIS", "SPOT",
    # EV / Auto
    "F", "GM", "RIVN",
    # Other high-volume
    "COIN", "MSTR", "UBER", "ABNB", "SHOP", "PYPL",
]

WEIGHTS = {"options": 0.40, "insider": 0.35, "institution": 0.25}

CONFLICT_THRESHOLD = 0.25  # minimum absolute score to be considered a directional signal


def detect_conflicts(options: dict, insider: dict, institution: dict) -> list[dict]:
    """Return signal pairs that disagree in direction by >= CONFLICT_THRESHOLD each."""
    signals = {
        "options":     options["score"],
        "insider":     insider["score"],
        "institution": institution["score"],
    }
    pairs = [
        ("options",     "insider"),
        ("options",     "institution"),
        ("insider",     "institution"),
    ]
    conflicts = []
    for a, b in pairs:
        sa, sb = signals[a], signals[b]
        if abs(sa) >= CONFLICT_THRESHOLD and abs(sb) >= CONFLICT_THRESHOLD and (sa > 0) != (sb > 0):
            conflicts.append({
                "signal_a": a,
                "score_a": round(sa, 3),
                "signal_b": b,
                "score_b": round(sb, 3),
                "description": f"{a.title()} {'bullish' if sa > 0 else 'bearish'} vs {b.title()} {'bullish' if sb > 0 else 'bearish'}",
            })
    return conflicts


def _score_ticker(ticker: str) -> Optional[dict]:
    """Score a single ticker across all signal categories."""
    try:
        t = yf.Ticker(ticker)
        spot = float(t.fast_info.last_price)
        prev = float(t.fast_info.previous_close or spot)
        change_pct = round(((spot - prev) / prev) * 100, 2) if prev else 0.0

        options_data  = opt_sig.score(ticker)
        insider_data  = ins_sig.score(ticker)
        inst_data     = inst_sig.score(ticker)

        composite = (
            options_data["score"]  * WEIGHTS["options"] +
            insider_data["score"]  * WEIGHTS["insider"] +
            inst_data["score"]     * WEIGHTS["institution"]
        )
        composite = round(max(-1.0, min(1.0, composite)), 3)

        # Collect the top reasons across all signals
        all_reasons = (
            options_data.get("reasons", []) +
            insider_data.get("reasons", []) +
            inst_data.get("reasons", [])
        )

        # Detect conflicting signals
        conflicts = detect_conflicts(options_data, insider_data, inst_data)

        # Determine overall verdict
        if composite >= 0.35:
            verdict = "Strong Buy"
        elif composite >= 0.15:
            verdict = "Bullish"
        elif composite <= -0.35:
            verdict = "Strong Sell"
        elif composite <= -0.15:
            verdict = "Bearish"
        else:
            verdict = "Neutral"

        return {
            "ticker": ticker,
            "price": round(spot, 2),
            "change_pct": change_pct,
            "composite_score": composite,
            "verdict": verdict,
            "conflicts": conflicts,
            "signals": {
                "options":     options_data,
                "insider":     insider_data,
                "institution": inst_data,
            },
            "top_reasons": all_reasons[:4],
        }
    except Exception as e:
        logger.debug(f"Skipping {ticker}: {e}")
        return None


def run_scan(tickers: Optional[list] = None) -> dict:
    """
    Scan the universe (or a custom list) and return bullish + bearish ranked lists.
    Results are cached for 1 hour.
    """
    universe = tickers or UNIVERSE
    cache_key = f"smart_money_scan_{'_'.join(sorted(universe))}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_score_ticker, t): t for t in universe}
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    results.sort(key=lambda r: r["composite_score"], reverse=True)

    bullish = [r for r in results if r["composite_score"] > 0][:25]
    bearish = [r for r in reversed(results) if r["composite_score"] < 0][:25]

    output = {
        "scanned": len(results),
        "universe_size": len(universe),
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "bullish": bullish,
        "bearish": bearish,
    }

    _cache.set(cache_key, output)
    return output
