from fastapi import APIRouter, HTTPException, Query
from features.institutional.analyzer import get_holders, run_screener

router = APIRouter()


@router.get("/holders/{ticker}")
async def holders(ticker: str):
    """Top institutional holders with position changes from 13F filings."""
    try:
        return get_holders(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/{ticker}")
async def flow(ticker: str):
    """Net institutional flow summary for a ticker."""
    try:
        data = get_holders(ticker.upper())
        return {"ticker": ticker.upper(), **data["flow"], "ownership": data["ownership"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/screener")
async def screener(
    min_inst_pct: float = Query(50.0, description="Minimum % institutionally held"),
    flow: str = Query("all", description="Filter by flow: all | accumulating | distributing"),
):
    """Screen stocks by institutional ownership level and accumulation/distribution trend."""
    try:
        return {"results": run_screener(min_inst_pct, flow)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
