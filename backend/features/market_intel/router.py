from fastapi import APIRouter, Query
from features.market_intel.scanner import run_scan, get_market_overview

router = APIRouter()


@router.get("/scan")
async def market_scan(
    horizon: str = Query("1m", description="Time horizon: 1w | 1m | 3m"),
    limit: int = Query(15, ge=1, le=25),
):
    data = run_scan(horizon=horizon)
    data["bullish"] = data["bullish"][:limit]
    data["bearish"] = data["bearish"][:limit]
    return data


@router.get("/overview")
async def market_overview():
    return get_market_overview()
