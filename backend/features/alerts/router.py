from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from features.alerts import store, checker

router = APIRouter()


class AddAlertRequest(BaseModel):
    ticker: str
    type: str      # price | reversal_confidence | smart_money_score
    condition: str # above | below
    value: float
    note: Optional[str] = ""


class AddWatchlistRequest(BaseModel):
    ticker: str


VALID_TYPES = {"price", "reversal_confidence", "smart_money_score"}
VALID_CONDITIONS = {"above", "below"}


@router.get("/watchlist")
async def get_watchlist():
    """Get all watchlist tickers with live quotes."""
    items = store.get_watchlist()
    tickers = [i["ticker"] for i in items]
    if not tickers:
        return {"items": []}
    quotes = checker.get_watchlist_quotes(tickers)
    quote_map = {q["ticker"]: q for q in quotes}
    enriched = [{**item, **quote_map.get(item["ticker"], {})} for item in items]
    return {"items": enriched}


@router.post("/watchlist")
async def add_watchlist(req: AddWatchlistRequest):
    """Add a ticker to the watchlist."""
    return store.add_to_watchlist(req.ticker)


@router.delete("/watchlist/{ticker}")
async def remove_watchlist(ticker: str):
    """Remove a ticker from the watchlist."""
    if not store.remove_from_watchlist(ticker):
        raise HTTPException(status_code=404, detail=f"{ticker} not in watchlist")
    return {"removed": ticker.upper()}


@router.get("/list")
async def list_alerts():
    """Get all configured alerts."""
    return {"alerts": store.get_alerts()}


@router.post("/add")
async def add_alert(req: AddAlertRequest):
    """Create a new price or signal alert."""
    if req.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of: {VALID_TYPES}")
    if req.condition not in VALID_CONDITIONS:
        raise HTTPException(status_code=400, detail=f"condition must be one of: {VALID_CONDITIONS}")
    return store.add_alert(req.ticker, req.type, req.condition, req.value, req.note or "")


@router.delete("/{alert_id}")
async def remove_alert(alert_id: str):
    """Delete an alert."""
    if not store.remove_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}


@router.post("/{alert_id}/reset")
async def reset_alert(alert_id: str):
    """Reset a triggered alert so it can fire again."""
    store.reset_alert(alert_id)
    return {"reset": alert_id}


@router.get("/check")
async def check_alerts():
    """Run live check on all untriggered alerts. Returns any that just fired."""
    triggered = checker.check_all()
    return {"triggered": triggered, "count": len(triggered)}
