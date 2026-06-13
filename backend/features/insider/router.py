from fastapi import APIRouter, HTTPException, Query

from features.insider import fetcher
from features.insider.cluster import run_cluster_scan
from core import cache as _cache

router = APIRouter()

FEED_CACHE_TTL = 21600   # 6 hours — Form 4 data changes infrequently
SUMMARY_CACHE_TTL = 21600


@router.get("/feed/{ticker}")
async def transaction_feed(
    ticker: str,
    days: int = Query(180, ge=1, le=730, description="Look-back window in days"),
):
    """
    Recent Form 4 insider transactions for a specific ticker.
    Returns up to the last N days of transactions, sorted date-descending.
    Cached for 6 hours.
    """
    sym = ticker.upper()
    cache_key = f"insider_feed_{sym}_{days}"
    cached = _cache.get(cache_key, ttl=FEED_CACHE_TTL)
    if cached:
        return cached

    try:
        transactions = fetcher.fetch_transactions(sym, days=days)
        result = {
            "ticker": sym,
            "days": days,
            "count": len(transactions),
            "transactions": transactions,
        }
        _cache.set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary/{ticker}")
async def ticker_summary(
    ticker: str,
    days: int = Query(180, ge=1, le=730, description="Look-back window in days"),
):
    """
    Aggregate insider summary for a ticker:
    net shares bought, total value, insider count, and sentiment.
    Cached for 6 hours.
    """
    sym = ticker.upper()
    cache_key = f"insider_summary_{sym}_{days}"
    cached = _cache.get(cache_key, ttl=SUMMARY_CACHE_TTL)
    if cached:
        return cached

    try:
        summary = fetcher.fetch_summary(sym, days=days)
        _cache.set(cache_key, summary)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cluster")
async def cluster_scan(
    min_insiders: int = Query(2, ge=2, le=10, description="Minimum number of insiders buying"),
    days: int = Query(60, ge=7, le=365, description="Look-back window in days"),
    window_days: int = Query(30, ge=7, le=90, description="Rolling window size to detect cluster"),
):
    """
    Scan the stock universe for cluster insider buying activity.
    A cluster = min_insiders or more distinct insiders buying within any window_days-day window.
    Returns top 20 clusters ranked by cluster score.
    Cached for 2 hours.
    """
    try:
        return run_cluster_scan(
            min_insiders=min_insiders,
            days=days,
            window_days=window_days,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
