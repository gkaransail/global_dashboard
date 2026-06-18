"""
Insider trading top-20 scanner for the leaderboard.
Ranks stocks by net insider buy/sell value over the past 30 days.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from core import cache as _cache
from features.insider.fetcher import fetch_summary

logger = logging.getLogger(__name__)
CACHE_TTL = 3600  # 1 hour — insider data is slow to change

UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "BAC", "GS",
    "AMD", "NFLX", "CRM", "ORCL", "INTC", "QCOM", "AVGO", "MU", "TXN", "AMAT",
    "SPY", "QQQ", "UNH", "JNJ", "PFE", "LLY", "ABBV", "XOM", "CVX",
    "HD", "WMT", "COST", "MCD", "NKE", "V", "MA", "PYPL",
    "DIS", "COIN", "UBER", "PLTR", "SNOW", "CRWD", "PANW", "NET",
    "BRK-B", "C", "WFC", "MS", "SBUX",
]


def _score_insider(ticker: str) -> Optional[dict]:
    try:
        summary = fetch_summary(ticker, days=30)
        net_value = summary.get("net_value", 0)
        if net_value == 0:
            return None
        try:
            import yfinance as yf
            spot = yf.Ticker(ticker).fast_info.last_price or 0
        except Exception:
            spot = 0
        return {
            "ticker":    ticker,
            "net_value": net_value,
            "spot":      round(float(spot), 2) if spot else None,
            "buy_value":  summary.get("buy_value", 0),
            "sell_value": summary.get("sell_value", 0),
            "sentiment":  summary.get("sentiment", "Neutral"),
        }
    except Exception as e:
        logger.debug(f"Insider top20 {ticker}: {e}")
        return None


def top20() -> dict:
    """Return top-20 insider buy and sell picks by net transaction value (30 days)."""
    cache_key = "insider:top20"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    scored = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_score_insider, t): t for t in UNIVERSE}
        for future in as_completed(futures, timeout=180):
            try:
                res = future.result(timeout=30)
                if res is not None:
                    scored.append(res)
            except Exception as e:
                logger.debug(f"Insider future error: {e}")

    bullish = sorted(
        [r for r in scored if r["net_value"] > 0],
        key=lambda x: x["net_value"], reverse=True
    )[:20]

    bearish = sorted(
        [r for r in scored if r["net_value"] < 0],
        key=lambda x: x["net_value"]
    )[:20]

    result = {
        "bullish": [
            {
                "ticker":    r["ticker"],
                "direction": 1,
                "score":     round(r["net_value"] / 1_000_000, 2),  # in $M
                "spot":      r["spot"],
                "signals":   [f"Net buy ${r['net_value']/1e6:.1f}M (30d)"],
            }
            for r in bullish
        ],
        "bearish": [
            {
                "ticker":    r["ticker"],
                "direction": -1,
                "score":     round(abs(r["net_value"]) / 1_000_000, 2),
                "spot":      r["spot"],
                "signals":   [f"Net sell ${abs(r['net_value'])/1e6:.1f}M (30d)"],
            }
            for r in bearish
        ],
    }
    _cache.set(cache_key, result)
    return result
