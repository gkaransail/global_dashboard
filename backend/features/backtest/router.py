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


# ── Signal Comparison ────────────────────────────────────────────────────────

@router.get("/compare")
def compare():
    """Signal accuracy leaderboard — all features and quant models ranked by win rate."""
    try:
        db.init_db()
        return {"signals": db.get_all_source_stats()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan-quant")
def scan_quant():
    """
    Run all quant models on each watchlist ticker and log predictions.
    Skips neutral signals (direction=0) and duplicate same-day logs.
    """
    from features.quant.registry import REGISTRY, list_models as quant_models
    import yfinance as yf
    from datetime import date, timedelta, datetime as dt, timezone

    db.init_db()
    tickers = db.get_watchlist()
    if not tickers:
        return {"scanned": 0, "errors": [], "message": "Watchlist is empty — add tickers first"}

    model_ids = [m["id"] for m in quant_models() if m["id"] != "ensemble"]  # skip ensemble (meta-model)
    today     = date.today().isoformat()
    scanned   = 0
    skipped   = 0
    errors    = []

    def _spot(ticker):
        try:
            return float(yf.Ticker(ticker).fast_info.last_price or 0) or None
        except Exception:
            return None

    for ticker in tickers:
        spot = _spot(ticker)
        for model_id in model_ids:
            # Duplicate guard
            with db._conn() as conn:
                if conn.execute(
                    "SELECT id FROM predictions WHERE ticker=? AND feature=? AND source='quant' AND DATE(predicted_at)=? LIMIT 1",
                    (ticker, model_id, today)
                ).fetchone():
                    skipped += 1
                    continue
            try:
                result = REGISTRY[model_id].analyze(ticker)
                if result.direction == 0:
                    skipped += 1
                    continue
                tf        = result.timeframe or "long"
                eval_days = {"short": 7, "long": 30, "meta": 21}.get(tf, 14)
                db.insert_prediction({
                    "ticker":             ticker,
                    "timeframe":          tf,
                    "predicted_at":       dt.now(timezone.utc).isoformat(),
                    "direction":          result.direction,
                    "score":              round(result.confidence / 100 * result.direction, 3),
                    "spot_at_prediction": spot,
                    "evaluate_after":     (date.today() + timedelta(days=eval_days)).isoformat(),
                    "source":             "quant",
                    "feature":            model_id,
                })
                scanned += 1
            except Exception as e:
                errors.append({"ticker": ticker, "model": model_id, "error": str(e)})

    return {
        "scanned": scanned, "skipped": skipped,
        "errors": errors[:20], "tickers": tickers, "models": model_ids,
    }


# ── Order Flow Scan ──────────────────────────────────────────────────────────

@router.post("/scan-order-flow")
def scan_order_flow():
    """
    Run order flow analysis on each watchlist ticker and log intraday predictions.
    Direction derived from cumulative delta bias + OFI%. Evaluates next day.
    """
    from features.order_flow.router import _fetch, _enrich, _momentum_and_divergence
    import yfinance as yf
    from datetime import date, timedelta, datetime as dt, timezone

    db.init_db()
    tickers = db.get_watchlist()
    if not tickers:
        return {"scanned": 0, "errors": [], "message": "Watchlist is empty — add tickers first"}

    today   = date.today().isoformat()
    scanned = 0
    skipped = 0
    errors  = []

    def _spot(ticker):
        try:
            return float(yf.Ticker(ticker).fast_info.last_price or 0) or None
        except Exception:
            return None

    for ticker in tickers:
        with db._conn() as conn:
            if conn.execute(
                "SELECT id FROM predictions WHERE ticker=? AND source='order_flow' AND DATE(predicted_at)=? LIMIT 1",
                (ticker, today)
            ).fetchone():
                skipped += 1
                continue
        try:
            df = _fetch(ticker, "1d")
            if df is None or len(df) < 10:
                skipped += 1
                continue

            df = _enrich(df)

            cum_delta = float(df["cum_delta"].iloc[-1])
            buy_vol   = float(df["buy_vol"].sum())
            total_vol = float(df["volume"].sum())
            ofi_pct   = buy_vol / total_vol * 100 if total_vol > 0 else 50.0

            mom = _momentum_and_divergence(df)
            mom_dir = mom.get("direction", "neutral")
            accelerating = mom.get("momentum") == "accelerating"

            # Require both delta and OFI to agree; skip mixed signals
            delta_bull = cum_delta > 0
            ofi_bull   = ofi_pct > 52
            ofi_bear   = ofi_pct < 48

            if delta_bull and ofi_bull:
                direction = 1
            elif not delta_bull and ofi_bear:
                direction = -1
            else:
                skipped += 1
                continue

            # Score: OFI strength + momentum boost
            ofi_strength = abs(ofi_pct - 50) / 50
            mom_boost    = 0.1 if accelerating and mom_dir == ("bullish" if direction == 1 else "bearish") else 0.0
            score        = round(min(ofi_strength + mom_boost, 1.0) * direction, 3)

            db.insert_prediction({
                "ticker":             ticker,
                "timeframe":          "1d",
                "predicted_at":       dt.now(timezone.utc).isoformat(),
                "direction":          direction,
                "score":              score,
                "spot_at_prediction": _spot(ticker),
                "evaluate_after":     (date.today() + timedelta(days=1)).isoformat(),
                "source":             "order_flow",
                "feature":            "order_flow",
            })
            scanned += 1
        except Exception as e:
            errors.append({"ticker": ticker, "error": str(e)})

    return {"scanned": scanned, "skipped": skipped, "errors": errors[:20], "tickers": tickers}


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
