from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from features.options.analyzers.chain    import get_expirations, get_chain
from features.options.analyzers.unusual  import get_unusual_activity
from features.options.analyzers.skew     import get_skew
from features.options.analyzers.analysis import get_analysis
from features.options.analyzers.scanner  import get_top_movers

router = APIRouter()


@router.get("/expirations/{ticker}")
async def expirations(ticker: str):
    """List all available expiration dates with DTE for a ticker."""
    try:
        return get_expirations(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chain/{ticker}")
async def chain(
    ticker: str,
    expiration: str = Query(..., description="Expiration date YYYY-MM-DD"),
    strike_range: float = Query(0.25, description="Strike filter: ±% from spot (0.25 = ±25%)"),
):
    """
    Full options chain for a ticker and expiration with Black-Scholes Greeks.
    Returns calls[] and puts[] each containing: strike, last, bid, ask, IV%, delta, gamma, theta, vega, OI, volume.
    """
    try:
        return get_chain(ticker, expiration, strike_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/unusual/{ticker}")
async def unusual(
    ticker: str,
    max_expirations: int = Query(6, ge=1, le=12),
    min_score: float = Query(0.25, ge=0.0, le=1.0),
):
    """
    Detect unusual options activity: high volume/OI ratio, large premium flows,
    elevated IV. Sorted by unusual score descending.
    """
    try:
        return get_unusual_activity(ticker, max_expirations, min_score)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skew/{ticker}")
async def skew(
    ticker: str,
    max_expirations: int = Query(8, ge=2, le=12),
):
    """
    IV skew (volatility smile) and term structure.
    Returns per-expiration IV smile data and ATM IV term structure for charting.
    """
    try:
        return get_skew(ticker, max_expirations)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


VALID_TIMEFRAMES = {"1h", "1d", "1w", "1mo", "3mo", "6mo", "1y", "5y", "all"}
SCAN_TIMEFRAMES  = {"1w", "1mo", "3mo", "6mo", "1y"}

@router.get("/top-movers")
async def top_movers(
    timeframe: str = Query("1mo", description="Timeframe: 1w | 1mo | 3mo | 6mo | 1y"),
):
    """
    Scan ~50 liquid stocks and return top 10 bullish + bearish based on
    options flow signals (P/C ratio, max pain, IV rank). Cached 30 min.
    First call may take ~20-30s; subsequent calls within the cache window are instant.
    """
    if timeframe not in SCAN_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of: {', '.join(sorted(SCAN_TIMEFRAMES))}")
    try:
        return get_top_movers(timeframe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis/{ticker}")
async def analysis(
    ticker: str,
    timeframe: str = Query("3mo", description="Timeframe: 1h | 1d | 1w | 1mo | 3mo | 6mo | 1y | 5y | all"),
):
    """
    Timeframe-aware market snapshot: expected move, max pain, key OI levels,
    P/C sentiment, and narrative. Selects the nearest expiration matching
    the timeframe (1h/1d → 0-3DTE, 1w → 7DTE, 1mo → 30DTE, etc.)
    """
    if timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of: {', '.join(sorted(VALID_TIMEFRAMES))}")
    try:
        return get_analysis(ticker, timeframe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
