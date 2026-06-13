from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional
from features.smart_money.scanner import run_scan, UNIVERSE
from core import cache as _cache

router = APIRouter()


@router.get("/scan")
async def smart_money_scan(
    tickers: Optional[str] = Query(None, description="Comma-separated tickers. Defaults to full universe."),
    refresh: bool = Query(False, description="Force a fresh scan, ignoring cache."),
):
    """
    Scan stocks for smart money signals: options flow, insider buying, institutional positioning.
    Returns top 25 bullish and top 25 bearish ranked by composite score.
    First call takes ~30s (scanning ~75 stocks concurrently). Results cached 1 hour.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",")] if tickers else None

    if refresh:
        key = f"smart_money_scan_{'_'.join(sorted(ticker_list or UNIVERSE))}"
        _cache.invalidate(key)

    try:
        return run_scan(ticker_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ticker/{ticker}")
async def ticker_detail(ticker: str):
    """Full signal breakdown for a single ticker."""
    from features.smart_money.scanner import _score_ticker
    result = _score_ticker(ticker.upper())
    if not result:
        raise HTTPException(status_code=404, detail=f"Could not score {ticker}")
    return result
