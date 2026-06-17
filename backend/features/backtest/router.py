from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from features.backtest import db, evaluator, rl

router = APIRouter()


class WatchlistBody(BaseModel):
    tickers: list[str]


@router.get("/stats")
def stats():
    """Overall performance statistics."""
    try:
        db.init_db()
        return db.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions")
def predictions(limit: int = 100):
    """All evaluated predictions, newest first."""
    try:
        db.init_db()
        rows = db.get_all_evaluated()
        return {"predictions": rows[:limit], "total": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending")
def pending():
    """Predictions still waiting for their evaluation date."""
    try:
        db.init_db()
        rows = db.get_pending()
        return {"pending": rows, "count": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate")
def evaluate():
    """Trigger evaluation of all matured predictions."""
    try:
        result = evaluator.evaluate_pending()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/force-evaluate")
def force_evaluate():
    """Evaluate all pending predictions NOW using current spot price, ignoring evaluation date."""
    try:
        result = evaluator.force_evaluate_all()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train")
def train():
    """Run RL weight update pass over all evaluated predictions."""
    try:
        result = rl.run_rl_update()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weights")
def weights():
    """Current signal weights with accuracy and drift from base."""
    try:
        return {"weights": rl.get_weights_summary()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-weights")
def reset_weights():
    """Reset all signal weights back to their base values."""
    try:
        db.init_db()
        with db._conn() as conn:
            conn.execute("UPDATE signal_weights SET weight=base_weight, accuracy=NULL, sample_count=0")
        return {"status": "reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Watchlist ─────────────────────────────────────────────────────────────────

@router.get("/watchlist")
def get_watchlist():
    """Get the persisted watchlist."""
    try:
        db.init_db()
        return {"tickers": db.get_watchlist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/watchlist")
def set_watchlist(body: WatchlistBody):
    """Persist the full watchlist (replaces existing)."""
    try:
        db.init_db()
        db.set_watchlist(body.tickers)
        return {"tickers": db.get_watchlist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan-watchlist")
def scan_watchlist():
    """
    Run options analysis on every watchlist ticker and log predictions.
    Uses source='watchlist' so results can be filtered separately.
    """
    from features.options.analyzers.analysis import get_analysis
    from features.backtest.collector import log_prediction

    db.init_db()
    tickers = db.get_watchlist()
    if not tickers:
        return {"scanned": 0, "errors": [], "message": "Watchlist is empty"}

    scanned = 0
    errors  = []
    for ticker in tickers:
        try:
            analysis = get_analysis(ticker, timeframe="1mo")
            log_prediction(analysis, source="watchlist")
            scanned += 1
        except Exception as e:
            errors.append({"ticker": ticker, "error": str(e)})

    return {"scanned": scanned, "errors": errors, "tickers": tickers}
