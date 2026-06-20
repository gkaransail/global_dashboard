import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from features.insider import fetcher
from features.insider.cluster import run_cluster_scan, UNIVERSE
from core import cache as _cache

router = APIRouter()
logger = logging.getLogger(__name__)

FEED_CACHE_TTL = 21600   # 6 hours — Form 4 data changes infrequently
SUMMARY_CACHE_TTL = 21600
RECENT_CACHE_TTL = 7200  # 2 hours


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
        # Enrich with current price for P&L comparison
        current_price = None
        try:
            current_price = round(float(yf.Ticker(sym).fast_info.last_price), 2)
        except Exception:
            pass
        for tx in transactions:
            tx["current_price"] = current_price
            if tx.get("price") and current_price:
                tx["pnl_pct"] = round((current_price - tx["price"]) / tx["price"] * 100, 2)
            else:
                tx["pnl_pct"] = None
        result = {
            "ticker": sym,
            "days": days,
            "count": len(transactions),
            "current_price": current_price,
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


@router.get("/recent")
async def recent_feed(
    days: int = Query(30, ge=1, le=365, description="Look-back window in days"),
    tx_type: str = Query("all", description="Filter: all | Buy | Sell"),
    limit: int = Query(300, ge=1, le=1000, description="Max transactions to return"),
):
    """
    All insider transactions across the tracked universe within the last N days.
    Scans all tickers in parallel and returns a flat feed sorted date-descending.
    Cached for 2 hours.
    """
    cache_key = f"insider_recent_{days}_{tx_type}_{limit}"
    cached = _cache.get(cache_key, ttl=RECENT_CACHE_TTL)
    if cached:
        return cached

    try:
        all_txs: list[dict] = []
        with ThreadPoolExecutor(max_workers=12) as pool:
            futs = {pool.submit(fetcher.fetch_transactions, sym, days): sym for sym in UNIVERSE}
            for f in as_completed(futs):
                try:
                    all_txs.extend(f.result())
                except Exception as exc:
                    logger.debug(f"Ticker scan error: {exc}")

        if tx_type.lower() != "all":
            all_txs = [t for t in all_txs if t["transaction_type"].lower() == tx_type.lower()]

        all_txs.sort(key=lambda t: t.get("date", ""), reverse=True)
        page = all_txs[:limit]

        result = {
            "days": days,
            "universe_size": len(UNIVERSE),
            "total": len(all_txs),
            "count": len(page),
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "transactions": page,
        }
        _cache.set(cache_key, result)
        return result
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
