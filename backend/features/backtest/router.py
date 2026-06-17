from fastapi import APIRouter, HTTPException
from features.backtest import db, evaluator, rl

router = APIRouter()


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
