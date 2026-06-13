from fastapi import APIRouter, HTTPException, Query
from features.technical.analyzer import (
    get_indicators,
    get_patterns,
    get_levels,
    get_screener,
)

router = APIRouter()


@router.get("/indicators/{ticker}")
async def indicators(
    ticker: str,
    period: str = Query("3mo", description="yfinance period string"),
    lookback_days: int = Query(90, ge=10, le=365, description="Days of history to fetch"),
):
    """
    Returns RSI, MACD, Bollinger Bands, EMA20/50/200, ATR, Stochastic, VWAP
    as a JSON dict with current values and recent history arrays (last 60 bars).
    """
    try:
        return get_indicators(ticker.upper(), period=period, lookback_days=lookback_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns/{ticker}")
async def patterns(
    ticker: str,
    period: str = Query("6mo", description="yfinance period string"),
):
    """Returns detected chart patterns with confidence, target, and invalidation levels."""
    try:
        return get_patterns(ticker.upper(), period=period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/levels/{ticker}")
async def levels(
    ticker: str,
    period: str = Query("6mo", description="yfinance period string"),
):
    """Returns support and resistance levels derived from price history."""
    try:
        return get_levels(ticker.upper(), period=period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/screener")
async def screener(
    conditions: str = Query("", description="Comma-separated condition names"),
    limit: int = Query(30, ge=1, le=100, description="Max results to return"),
):
    """
    Scans a fixed universe of 50 popular tickers for the given conditions.
    Returns scored results sorted by score descending.
    """
    try:
        cond_list = [c.strip() for c in conditions.split(",") if c.strip()] if conditions else []
        return get_screener(cond_list, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
