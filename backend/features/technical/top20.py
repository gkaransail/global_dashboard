"""
Technical Analysis top-20 scanner for the leaderboard.
Scores bullish and bearish separately from technical conditions.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import yfinance as yf
from core import cache as _cache
from features.technical.analyzer import _scan_ticker, SCREENER_UNIVERSE

logger = logging.getLogger(__name__)
CACHE_TTL = 1800  # 30 min

# Conditions that count as bullish / bearish signals
_BULL_CONDITIONS = {"above_ema200", "golden_cross", "rsi_oversold", "near_52w_high"}
_BEAR_CONDITIONS = {"below_ema200", "death_cross", "rsi_overbought", "near_52w_low"}


def _score_technical(ticker: str) -> Optional[dict]:
    result = _scan_ticker(ticker)
    if result is None:
        return None

    conditions = set(result.get("conditions", []))
    bull_score = sum(1 for c in conditions if c in _BULL_CONDITIONS)
    bear_score = sum(1 for c in conditions if c in _BEAR_CONDITIONS)

    if bull_score == 0 and bear_score == 0:
        return None

    return {
        "ticker":     result["ticker"],
        "spot":       result["price"],
        "bull_score": bull_score,
        "bear_score": bear_score,
        "conditions": list(conditions),
        "rsi":        result.get("rsi"),
        "change_pct": result.get("change_pct"),
    }


def top20() -> dict:
    """Return top-20 bullish and bearish picks based on technical conditions."""
    cache_key = "technical:top20"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    scored = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_score_technical, t): t for t in SCREENER_UNIVERSE}
        for future in as_completed(futures, timeout=120):
            try:
                res = future.result(timeout=20)
                if res is not None:
                    scored.append(res)
            except Exception as e:
                logger.debug(f"Technical top20 error: {e}")

    bullish = sorted(
        [r for r in scored if r["bull_score"] > r["bear_score"]],
        key=lambda x: x["bull_score"], reverse=True
    )[:20]

    bearish = sorted(
        [r for r in scored if r["bear_score"] > r["bull_score"]],
        key=lambda x: x["bear_score"], reverse=True
    )[:20]

    result = {
        "bullish": [
            {
                "ticker":    r["ticker"],
                "direction": 1,
                "score":     r["bull_score"],
                "spot":      r["spot"],
                "signals":   [c for c in r["conditions"] if c in _BULL_CONDITIONS],
            }
            for r in bullish
        ],
        "bearish": [
            {
                "ticker":    r["ticker"],
                "direction": -1,
                "score":     r["bear_score"],
                "spot":      r["spot"],
                "signals":   [c for c in r["conditions"] if c in _BEAR_CONDITIONS],
            }
            for r in bearish
        ],
    }
    _cache.set(cache_key, result)
    return result
