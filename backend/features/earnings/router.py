from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from features.earnings.analyzer import get_calendar, get_analysis, DEFAULT_TICKERS

router = APIRouter()


@router.get("/calendar")
async def earnings_calendar(
    tickers: Optional[str] = Query(None, description="Comma-separated tickers. Defaults to watchlist."),
    days_ahead: int = Query(30, ge=1, le=90, description="How many days ahead to look"),
):
    """
    Upcoming earnings for a list of tickers within the next N days.
    Each result includes expected move from options and historical avg move.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",")] if tickers else DEFAULT_TICKERS
    if len(ticker_list) > 30:
        raise HTTPException(status_code=400, detail="Max 30 tickers per request.")
    try:
        return get_calendar(ticker_list, days_ahead)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis/{ticker}")
async def earnings_analysis(ticker: str):
    """
    Full earnings analysis for one ticker: expected move, last 8 quarters of
    EPS surprises + price reactions, and whether options are over/under pricing
    this earnings relative to history.
    """
    try:
        return get_analysis(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
