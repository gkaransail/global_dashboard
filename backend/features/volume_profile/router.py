from fastapi import APIRouter, HTTPException, Query
from features.volume_profile.analyzer import get_volume_profile, get_delta_flow

router = APIRouter()

VALID_TF = {"1d", "5d", "1mo", "3mo", "6mo", "1y"}


@router.get("/profile/{ticker}")
async def profile(
    ticker: str,
    timeframe: str = Query("1d", description="1d | 5d | 1mo | 3mo | 6mo | 1y"),
):
    if timeframe not in VALID_TF:
        raise HTTPException(400, detail=f"Invalid timeframe. Use: {sorted(VALID_TF)}")
    try:
        return get_volume_profile(ticker.upper(), timeframe)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/delta/{ticker}")
async def delta_flow(
    ticker: str,
    timeframe: str = Query("1d", description="1d | 5d | 1mo | 3mo | 6mo | 1y"),
):
    if timeframe not in VALID_TF:
        raise HTTPException(400, detail=f"Invalid timeframe. Use: {sorted(VALID_TF)}")
    try:
        return get_delta_flow(ticker.upper(), timeframe)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=str(e))
