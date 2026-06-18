"""
Institutional holdings top-20 scanner for the leaderboard.
Ranks stocks by institutional accumulation / distribution (avg position change %).
"""
import logging
from core import cache as _cache
from features.institutional.analyzer import run_screener

logger = logging.getLogger(__name__)
CACHE_TTL = 3600  # 1 hour — 13F data is quarterly


def top20() -> dict:
    """Return top-20 stocks being accumulated vs distributed by institutions."""
    cache_key = "institutional:top20"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    try:
        all_results = run_screener(min_inst_pct=0.0, flow="all")
    except Exception as e:
        logger.error(f"Institutional top20 screener failed: {e}")
        return {"bullish": [], "bearish": []}

    accumulating = [r for r in all_results if r.get("avg_change_pct", 0) > 0]
    distributing = [r for r in all_results if r.get("avg_change_pct", 0) < 0]

    accumulating.sort(key=lambda x: x.get("avg_change_pct", 0), reverse=True)
    distributing.sort(key=lambda x: x.get("avg_change_pct", 0))

    result = {
        "bullish": [
            {
                "ticker":    r["ticker"],
                "direction": 1,
                "score":     round(r.get("avg_change_pct", 0), 2),
                "spot":      None,
                "signals":   [
                    f"Inst. accumulating +{r.get('avg_change_pct',0):.1f}% avg",
                    f"{r.get('buyer_count',0)} buyers vs {r.get('seller_count',0)} sellers",
                ],
            }
            for r in accumulating[:20]
        ],
        "bearish": [
            {
                "ticker":    r["ticker"],
                "direction": -1,
                "score":     round(abs(r.get("avg_change_pct", 0)), 2),
                "spot":      None,
                "signals":   [
                    f"Inst. distributing {r.get('avg_change_pct',0):.1f}% avg",
                    f"{r.get('seller_count',0)} sellers vs {r.get('buyer_count',0)} buyers",
                ],
            }
            for r in distributing[:20]
        ],
    }
    _cache.set(cache_key, result)
    return result
