"""
Federation API — exposes this dashboard's data to peer dashboards and accepts imports.

Peers call these endpoints directly (via ngrok URL or Tailscale IP).
The MCP server tools also use these endpoints internally.

Endpoints:
  GET  /status                    — health + capability handshake
  GET  /analysis/{ticker}         — shareable analysis snapshot
  GET  /weights                   — current RL signal weights
  GET  /predictions/export        — evaluated predictions for peer import
  POST /predictions/import        — import evaluated predictions from a peer
  POST /weights/merge             — federated weight averaging with a peer
  GET  /compare/{ticker}          — compare local vs peer analysis (peer_url param)
"""
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from features.backtest import db, rl
from features.backtest.db import init_db

logger = logging.getLogger(__name__)
router = APIRouter()

HTTPX_TIMEOUT = 15.0  # seconds


# ── Models ────────────────────────────────────────────────────────────────────

class ImportBody(BaseModel):
    predictions: list[dict]
    peer_url: str = ""


class MergeWeightsBody(BaseModel):
    peer_url: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _local_analysis(ticker: str, timeframe: str = "1mo") -> dict:
    """Get analysis from the options analyzer — same as the overview tab."""
    from features.options.analyzers.analysis import get_analysis
    return get_analysis(ticker.upper(), timeframe=timeframe)


async def _fetch_peer(peer_url: str, path: str) -> dict:
    """HTTP GET to a peer dashboard's federation endpoint."""
    url = peer_url.rstrip("/") + path
    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Peer timed out: {url}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Peer returned {e.response.status_code}: {url}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach peer at {url}: {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Health + capability handshake. Peers call this to verify connectivity."""
    init_db()
    stats = db.get_stats()
    weights = rl.get_weights_summary()
    return {
        "status":     "ok",
        "dashboard":  "global_dashboard",
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "capabilities": ["analysis", "weights", "predictions", "compare", "merge_weights"],
        "stats": {
            "total_predictions": stats["total_predictions"],
            "evaluated":         stats["evaluated"],
            "win_rate_pct":      stats["win_rate_pct"],
        },
        "signal_count": len(weights),
    }


@router.get("/analysis/{ticker}")
def shareable_analysis(
    ticker: str,
    timeframe: str = Query("1mo", description="Timeframe for the analysis"),
):
    """
    Shareable analysis snapshot for a ticker.
    Peers call this to get this dashboard's view for comparison.
    """
    try:
        data = _local_analysis(ticker, timeframe)
        weights = {w["signal"]: w["weight"] for w in rl.get_weights_summary()}
        return {
            "ticker":          data.get("ticker"),
            "timeframe":       timeframe,
            "spot_price":      data.get("spot_price"),
            "direction":       data.get("narrative", {}).get("direction") if isinstance(data.get("narrative"), dict) else None,
            "score_label":     data.get("narrative", {}).get("score_label") if isinstance(data.get("narrative"), dict) else None,
            "pc_atm_ratio":    data.get("pc_atm_ratio"),
            "pc_vol_ratio":    data.get("pc_vol_ratio"),
            "iv_rank":         data.get("iv_rank"),
            "atm_iv_pct":      data.get("atm_iv_pct"),
            "max_pain":        data.get("max_pain"),
            "expected_move":   data.get("expected_move"),
            "squeeze":         data.get("squeeze_candidate"),
            "gex_environment": (data.get("gex") or {}).get("environment"),
            "options_flow":    data.get("options_flow_significance"),
            "signal_weights":  weights,
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weights")
def export_weights():
    """Export current RL signal weights with accuracy and sample counts."""
    init_db()
    weights = rl.get_weights_summary()
    return {
        "weights":   {w["signal"]: {"weight": w["weight"], "sample_count": w["sample_count"], "accuracy": w["accuracy"]} for w in weights},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/predictions/export")
def export_predictions(limit: int = Query(500, ge=1, le=2000)):
    """Export evaluated predictions for peer import."""
    init_db()
    preds = db.get_all_evaluated()[:limit]
    # Remove internal IDs — peer will assign their own
    exportable = []
    for p in preds:
        p_copy = dict(p)
        p_copy.pop("id", None)
        exportable.append(p_copy)
    return {
        "predictions": exportable,
        "count":       len(exportable),
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    }


@router.post("/predictions/import")
def import_predictions(body: ImportBody):
    """
    Import evaluated predictions from a peer dashboard.
    Skips duplicates (same ticker + timeframe + predicted_at).
    Sets source = 'peer:{peer_url}'.
    """
    init_db()
    imported = 0
    skipped  = 0
    errors   = 0
    source   = f"peer:{body.peer_url}" if body.peer_url else "peer:unknown"

    for pred in body.predictions:
        try:
            # Only import evaluated predictions with outcomes
            if not pred.get("evaluated") or pred.get("actual_return_pct") is None:
                skipped += 1
                continue
            # Check duplicate: same ticker + timeframe + predicted_at
            with db._conn() as conn:
                exists = conn.execute(
                    "SELECT id FROM predictions WHERE ticker=? AND timeframe=? AND predicted_at=?",
                    (pred.get("ticker"), pred.get("timeframe"), pred.get("predicted_at"))
                ).fetchone()
            if exists:
                skipped += 1
                continue
            db.insert_prediction({**pred, "source": source})
            # Also mark it as already evaluated
            with db._conn() as conn:
                conn.execute(
                    "UPDATE predictions SET evaluated=1, outcome_at=?, spot_at_outcome=?, actual_return_pct=?, correct=? WHERE ticker=? AND timeframe=? AND predicted_at=?",
                    (pred.get("outcome_at"), pred.get("spot_at_outcome"), pred.get("actual_return_pct"), pred.get("correct"),
                     pred.get("ticker"), pred.get("timeframe"), pred.get("predicted_at"))
                )
            imported += 1
        except Exception as e:
            logger.debug(f"Import error: {e}")
            errors += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/weights/merge")
async def merge_weights(body: MergeWeightsBody):
    """
    Federated weight averaging: fetch peer's weights and merge with local
    weights using sample-count-weighted averaging.
    Updates local signal weights in place.
    """
    init_db()
    peer_data   = await _fetch_peer(body.peer_url, "/api/v1/federation/weights")
    peer_weights = peer_data.get("weights", {})

    local_summary = rl.get_weights_summary()
    local_weights = {w["signal"]: w for w in local_summary}

    changes = {}
    for signal, local in local_weights.items():
        peer = peer_weights.get(signal)
        if not peer:
            continue

        local_w  = local["weight"]
        local_n  = local["sample_count"] or 0
        peer_w   = peer["weight"]
        peer_n   = peer.get("sample_count") or 0
        total_n  = local_n + peer_n

        merged_w = (local_w * local_n + peer_w * peer_n) / total_n if total_n > 0 else (local_w + peer_w) / 2
        merged_w = round(max(0.1, min(5.0, merged_w)), 3)

        if abs(merged_w - local_w) > 0.001:
            changes[signal] = {"before": local_w, "after": merged_w, "peer_weight": peer_w}

        # Merge accuracy too (weighted average)
        local_acc = local.get("accuracy") or 0
        peer_acc  = peer.get("accuracy") or 0
        merged_acc = (local_acc * local_n + peer_acc * peer_n) / total_n if total_n > 0 else (local_acc + peer_acc) / 2

        db.update_signal_weight(signal, merged_w, round(merged_acc, 3), total_n)

    return {
        "merged":            len(changes),
        "changes":           changes,
        "peer_url":          body.peer_url,
        "peer_predictions":  peer_data.get("sample_count", 0),
        "timestamp":         datetime.now(timezone.utc).isoformat(),
    }


@router.get("/compare/{ticker}")
async def compare_analysis(
    ticker: str,
    peer_url: str = Query(..., description="Peer dashboard base URL, e.g. https://abc.ngrok.io"),
    timeframe: str = Query("1mo"),
):
    """
    Compare this dashboard's analysis of a ticker against a peer's.
    Returns side-by-side signal values and highlights disagreements.
    """
    try:
        local = shareable_analysis(ticker, timeframe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local analysis failed: {e}")

    peer = await _fetch_peer(peer_url, f"/api/v1/federation/analysis/{ticker}?timeframe={timeframe}")

    # Detect disagreements
    disagreements = []
    compare_fields = ["pc_atm_ratio", "iv_rank", "atm_iv_pct", "squeeze", "gex_environment", "options_flow", "direction"]
    for field in compare_fields:
        lv = local.get(field)
        pv = peer.get(field)
        if lv is None and pv is None:
            continue
        if isinstance(lv, float) and isinstance(pv, float):
            if abs(lv - pv) > 0.05 * max(abs(lv), abs(pv), 1):
                disagreements.append({"field": field, "local": lv, "peer": pv, "diff": round(lv - pv, 4)})
        elif lv != pv:
            disagreements.append({"field": field, "local": lv, "peer": pv})

    direction_agree = local.get("direction") == peer.get("direction")

    return {
        "ticker":           ticker.upper(),
        "timeframe":        timeframe,
        "direction_agree":  direction_agree,
        "local":            local,
        "peer":             peer,
        "peer_url":         peer_url,
        "disagreements":    disagreements,
        "disagreement_count": len(disagreements),
        "verdict": "agree" if direction_agree else "disagree",
    }
