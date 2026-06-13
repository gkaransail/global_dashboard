from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from features.screener.engine import run_scan, score_ticker

router = APIRouter()


class CustomScanRequest(BaseModel):
    tickers: list[str]


@router.get("/screen")
async def screen(
    sort_by:   str   = Query("composite_score", description="composite_score|technical|smart_money|fundamental|sentiment"),
    direction: str   = Query("all",             description="all|bull|bear"),
    min_score: int   = Query(0,                 ge=0, le=100),
    limit:     int   = Query(50,                ge=1, le=100),
):
    """
    Scan the default universe (~50 tickers) and return scores across all 4 factors.
    Results are cached 30 minutes. First call may take ~45 seconds.
    """
    data = run_scan()
    results = data["results"]

    # Direction filter
    if direction == "bull":
        results = [r for r in results if r["composite_score"] > 50]
    elif direction == "bear":
        results = [r for r in results if r["composite_score"] < 50]

    # Min score filter
    if min_score > 0:
        if direction == "bear":
            results = [r for r in results if (100 - r["composite_score"]) >= min_score]
        else:
            results = [r for r in results if r["composite_score"] >= min_score]

    # Sort
    sort_key_map = {
        "technical":   lambda r: r["scores"]["technical"],
        "smart_money": lambda r: r["scores"]["smart_money"],
        "fundamental": lambda r: r["scores"]["fundamental"],
        "sentiment":   lambda r: r["scores"]["sentiment"],
    }
    if sort_by in sort_key_map:
        results = sorted(results, key=sort_key_map[sort_by], reverse=True)

    return {
        **data,
        "results": results[:limit],
        "filters": {"sort_by": sort_by, "direction": direction, "min_score": min_score},
    }


@router.post("/screen/custom")
async def screen_custom(req: CustomScanRequest):
    """Scan a custom list of tickers (max 20)."""
    tickers = [t.strip().upper() for t in req.tickers[:20]]
    if not tickers:
        raise HTTPException(status_code=400, detail="tickers list is empty")
    return run_scan(tickers)


@router.get("/score/{ticker}")
async def single_score(ticker: str):
    """Get the full multi-factor score breakdown for a single ticker."""
    result = score_ticker(ticker.upper())
    if not result:
        raise HTTPException(status_code=404, detail=f"Could not score {ticker}")
    return result
