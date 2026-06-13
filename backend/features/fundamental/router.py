from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from features.fundamental.analyzer import get_overview, get_valuation, get_growth, get_quality, get_screener

router = APIRouter()


@router.get("/overview/{ticker}")
async def fundamental_overview(ticker: str):
    """
    All-in-one fundamental snapshot: valuation + growth + quality in a single call.
    Useful for the header card or quick summary.
    """
    try:
        return get_overview(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/valuation/{ticker}")
async def fundamental_valuation(ticker: str):
    """
    Valuation metrics: PE, PB, PS, EV/EBITDA, Graham Number, simple DCF estimate.
    """
    try:
        return get_valuation(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/growth/{ticker}")
async def fundamental_growth(ticker: str):
    """
    Growth metrics: revenue growth YoY and 3-year CAGR, earnings growth,
    margin trends, FCF yield, and a 0–100 growth score.
    """
    try:
        return get_growth(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quality/{ticker}")
async def fundamental_quality(ticker: str):
    """
    Quality/financial health metrics: ROE, ROA, ROIC, D/E, current ratio,
    Altman Z-score, Piotroski F-score, and a 0–100 quality score.
    """
    try:
        return get_quality(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/screener")
async def fundamental_screener(
    min_pe: Optional[float] = Query(None, description="Minimum PE ratio"),
    max_pe: Optional[float] = Query(None, description="Maximum PE ratio"),
    min_roe: Optional[float] = Query(None, description="Minimum ROE (as percentage, e.g. 10 for 10%)"),
    profitable_only: bool = Query(False, description="Only include profitable companies"),
    limit: int = Query(30, ge=1, le=50, description="Max results"),
):
    """
    Screener across a 50-stock universe with fundamental filters.
    Results are sorted by combined growth + quality score descending.
    """
    try:
        return get_screener(
            min_pe=min_pe,
            max_pe=max_pe,
            min_roe=min_roe,
            profitable_only=profitable_only,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
