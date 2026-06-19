"""
Quant Model Workbench API — with 30-min in-memory result cache.
"""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from features.quant.registry import REGISTRY, list_models

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory TTL cache ───────────────────────────────────────────────────────
_CACHE: dict[tuple, tuple] = {}  # (ticker, model_id) → (result_dict, expiry)
_TTL = timedelta(minutes=30)


def _cache_get(ticker: str, model_id: str):
    key = (ticker, model_id)
    entry = _CACHE.get(key)
    if entry and datetime.utcnow() < entry[1]:
        return entry[0]
    _CACHE.pop(key, None)
    return None


def _cache_set(ticker: str, model_id: str, result: dict):
    _CACHE[(ticker, model_id)] = (result, datetime.utcnow() + _TTL)


# ── Prediction logging ────────────────────────────────────────────────────────

def _log_quant_prediction(result: dict):
    """Silently log a non-neutral quant result as a backtest prediction (once per day per ticker+model)."""
    try:
        if result.get("error") or result.get("direction", 0) == 0:
            return
        import yfinance as yf
        from datetime import date, timedelta, datetime as dt, timezone
        from features.backtest.db import init_db, _conn, insert_prediction

        init_db()
        ticker   = result["ticker"]
        model_id = result["model_id"]
        tf       = result.get("timeframe", "long")
        today    = date.today().isoformat()

        with _conn() as conn:
            if conn.execute(
                "SELECT id FROM predictions WHERE ticker=? AND feature=? AND source='quant' AND DATE(predicted_at)=? LIMIT 1",
                (ticker, model_id, today)
            ).fetchone():
                return  # already logged today

        try:
            spot = float(yf.Ticker(ticker).fast_info.last_price or 0) or None
        except Exception:
            spot = None

        eval_days = {"short": 7, "long": 30, "meta": 21}.get(tf, 14)
        insert_prediction({
            "ticker":             ticker,
            "timeframe":          tf,
            "predicted_at":       dt.now(timezone.utc).isoformat(),
            "direction":          result["direction"],
            "score":              round(result.get("confidence", 50) / 100 * result["direction"], 3),
            "spot_at_prediction": spot,
            "evaluate_after":     (date.today() + timedelta(days=eval_days)).isoformat(),
            "source":             "quant",
            "feature":            model_id,
        })
        logger.debug(f"Logged quant prediction: {ticker} {model_id} dir={result['direction']}")
    except Exception as e:
        logger.debug(f"Quant prediction log failed: {e}")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/models")
def get_models():
    """List all available quant models."""
    return {"models": list_models()}


@router.get("/analyze/{ticker}")
def analyze(
    ticker: str,
    models: str = Query(..., description="Comma-separated model IDs"),
):
    """
    Run one or more quant models on a ticker.
    Results are cached per (ticker, model_id) for 30 minutes.
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
        cached = _cache_get(ticker, mid)
        if cached:
            results.append(cached)
            continue
        try:
            result = REGISTRY[mid].analyze(ticker)
            d = result.to_dict()
            _cache_set(ticker, mid, d)
            results.append(d)
            _log_quant_prediction(d)   # fire-and-forget backtest logging
        except Exception as e:
            logger.error(f"Quant model {mid} failed for {ticker}: {e}")
            results.append({
                "ticker":     ticker,
                "model_id":   mid,
                "model_name": REGISTRY[mid].name,
                "error":      str(e),
            })

    return {"ticker": ticker, "results": results}


@router.get("/search")
def search_ticker(q: str = Query(..., min_length=1, description="Company name or ticker")):
    """
    Search for tickers by name or symbol.
    Returns up to 8 equity matches with symbol, name, exchange, and sector.
    """
    import yfinance as yf
    try:
        results = yf.Search(q.strip(), max_results=10)
        quotes = [
            {
                "symbol":   r.get("symbol", ""),
                "name":     r.get("longname") or r.get("shortname", ""),
                "exchange": r.get("exchDisp", ""),
                "sector":   r.get("sectorDisp", ""),
                "type":     r.get("quoteType", ""),
            }
            for r in (results.quotes or [])
            if r.get("quoteType") == "EQUITY" and r.get("symbol")
        ][:8]
        return {"results": quotes}
    except Exception as e:
        logger.warning(f"Ticker search failed for '{q}': {e}")
        return {"results": []}


@router.delete("/cache")
def clear_cache():
    """Clear the result cache (useful during development)."""
    _CACHE.clear()
    return {"cleared": True}
