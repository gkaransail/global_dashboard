from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
from features.portfolio import store

router = APIRouter()


class AddPositionRequest(BaseModel):
    ticker: str
    shares: float
    cost_basis: float
    added_date: Optional[str] = None


class UpdatePositionRequest(BaseModel):
    shares: Optional[float] = None
    cost_basis: Optional[float] = None


def _enrich_position(pos: dict) -> dict:
    """Add live price, current value, and P&L to a stored position."""
    try:
        t = yf.Ticker(pos["ticker"])
        info = t.fast_info
        price = float(info.last_price)
        prev = float(info.previous_close or price)
        day_change_pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
    except Exception:
        price = None
        day_change_pct = None

    shares = pos["shares"]
    cost_basis = pos["cost_basis"]
    total_cost = round(shares * cost_basis, 2)
    current_value = round(shares * price, 2) if price else None
    unrealized_pnl = round(current_value - total_cost, 2) if current_value is not None else None
    pnl_pct = round((unrealized_pnl / total_cost) * 100, 2) if (unrealized_pnl is not None and total_cost > 0) else None

    return {
        **pos,
        "current_price": round(price, 2) if price else None,
        "day_change_pct": day_change_pct,
        "total_cost": total_cost,
        "current_value": current_value,
        "unrealized_pnl": unrealized_pnl,
        "pnl_pct": pnl_pct,
    }


@router.get("/holdings")
async def get_holdings():
    """All portfolio positions with live P&L."""
    positions = store.get_all()
    enriched = [_enrich_position(p) for p in positions]

    total_cost = sum(p["total_cost"] for p in enriched)
    total_value = sum(p["current_value"] for p in enriched if p["current_value"] is not None)
    total_pnl = round(total_value - total_cost, 2)
    total_pnl_pct = round((total_pnl / total_cost) * 100, 2) if total_cost > 0 else 0.0

    return {
        "positions": enriched,
        "summary": {
            "total_cost": round(total_cost, 2),
            "total_value": round(total_value, 2),
            "total_pnl": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "position_count": len(enriched),
        },
    }


@router.post("/add")
async def add_position(req: AddPositionRequest):
    """Add a new position to the portfolio."""
    if req.shares <= 0:
        raise HTTPException(status_code=400, detail="shares must be positive")
    if req.cost_basis <= 0:
        raise HTTPException(status_code=400, detail="cost_basis must be positive")
    position = store.add_position(req.ticker, req.shares, req.cost_basis, req.added_date)
    return _enrich_position(position)


@router.delete("/{position_id}")
async def remove_position(position_id: str):
    """Remove a position by ID."""
    if not store.remove_position(position_id):
        raise HTTPException(status_code=404, detail="Position not found")
    return {"deleted": position_id}


@router.patch("/{position_id}")
async def update_position(position_id: str, req: UpdatePositionRequest):
    """Update shares or cost basis for a position."""
    updated = store.update_position(position_id, req.shares, req.cost_basis)
    if not updated:
        raise HTTPException(status_code=404, detail="Position not found")
    return _enrich_position(updated)
