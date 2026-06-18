"""
Quant Model Workbench API.
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from features.quant.registry import REGISTRY, list_models

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/models")
def get_models():
    """List all available quant models."""
    return {"models": list_models()}


@router.get("/analyze/{ticker}")
def analyze(
    ticker: str,
    models: str = Query(..., description="Comma-separated model IDs, e.g. 'regime_detection'"),
):
    """
    Run one or more quant models on a ticker.
    Returns a result card per model.
    """
    ticker = ticker.upper().strip()
    model_ids = [m.strip() for m in models.split(",") if m.strip()]

    if not model_ids:
        raise HTTPException(status_code=400, detail="Provide at least one model ID")

    unknown = [m for m in model_ids if m not in REGISTRY]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown models: {unknown}")

    results = []
    for mid in model_ids:
        try:
            result = REGISTRY[mid].analyze(ticker)
            results.append(result.to_dict())
        except Exception as e:
            logger.error(f"Quant model {mid} failed for {ticker}: {e}")
            results.append({
                "ticker":     ticker,
                "model_id":   mid,
                "model_name": REGISTRY[mid].name,
                "error":      str(e),
            })

    return {"ticker": ticker, "results": results}
