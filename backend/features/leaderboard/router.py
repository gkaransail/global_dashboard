"""
Leaderboard API — feature-vs-feature prediction accuracy and comparison grid.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Query

from features.backtest import db
from features.backtest.db import init_db
from features.leaderboard import scanner

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary")
def get_summary():
    """Per-feature win rate, accuracy, and sample counts for the scoreboard cards."""
    init_db()
    stats = db.get_feature_stats()
    # Ensure all 4 features appear even if they have no predictions yet
    FEATURES = ["options", "technical", "insider", "institutional"]
    LABELS = {
        "options":       "Options Flow",
        "technical":     "Technical",
        "insider":       "Insider",
        "institutional": "Institutional",
    }
    by_feature = {s["feature"]: s for s in stats}
    result = []
    for f in FEATURES:
        if f in by_feature:
            entry = {**by_feature[f], "label": LABELS[f]}
        else:
            entry = {
                "feature": f, "label": LABELS[f],
                "total": 0, "evaluated": 0, "pending": 0,
                "win_rate_pct": None, "bull_win_rate": None,
                "bear_win_rate": None, "avg_return": None,
            }
        result.append(entry)
    return {"features": result, "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/picks")
def get_picks(
    timeframe: str = Query("1w", description="'1w' for weekly picks, '1mo' for monthly"),
    limit: int = Query(20, ge=5, le=50),
    evaluated_only: bool = Query(False),
):
    """Latest top-20 picks per feature with evaluation results where available."""
    init_db()
    picks = db.get_feature_picks(timeframe=timeframe, limit=limit)
    if evaluated_only:
        picks = [p for p in picks if p.get("evaluated")]

    by_feature: dict[str, dict[str, list]] = {}
    for pick in picks:
        f = pick.get("feature", "options")
        if f not in by_feature:
            by_feature[f] = {"bullish": [], "bearish": []}
        direction = pick.get("direction", 0)
        entry = {
            "ticker":         pick["ticker"],
            "direction":      direction,
            "score":          pick.get("score"),
            "spot_entry":     pick.get("spot_at_prediction"),
            "spot_exit":      pick.get("spot_at_outcome"),
            "return_pct":     pick.get("actual_return_pct"),
            "correct":        pick.get("correct"),
            "evaluated":      bool(pick.get("evaluated")),
            "predicted_at":   pick.get("predicted_at"),
        }
        if direction == 1:
            by_feature[f]["bullish"].append(entry)
        elif direction == -1:
            by_feature[f]["bearish"].append(entry)

    return {
        "timeframe": timeframe,
        "picks":     by_feature,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/comparison")
def get_comparison(
    timeframe: str = Query("1w"),
    min_consensus: int = Query(2, ge=1, le=4, description="Min features that must agree"),
):
    """
    Cross-feature comparison grid.
    Returns tickers where multiple features agree on direction,
    with each feature's pick and evaluation result.
    """
    init_db()
    picks = db.get_feature_picks(timeframe=timeframe, limit=50)

    FEATURES = ["options", "technical", "insider", "institutional"]

    matrix: dict[str, dict] = {}
    for pick in picks:
        ticker  = pick["ticker"]
        feature = pick.get("feature", "options")
        if ticker not in matrix:
            matrix[ticker] = {}
        matrix[ticker][feature] = {
            "direction":  pick.get("direction"),
            "score":      pick.get("score"),
            "return_pct": pick.get("actual_return_pct"),
            "correct":    pick.get("correct"),
            "evaluated":  bool(pick.get("evaluated")),
        }

    rows = []
    for ticker, feature_data in matrix.items():
        directions = [d["direction"] for d in feature_data.values() if d.get("direction") is not None]
        if not directions:
            continue

        bull_count = directions.count(1)
        bear_count = directions.count(-1)
        consensus_direction = 1 if bull_count > bear_count else -1 if bear_count > bull_count else 0
        consensus_count = max(bull_count, bear_count)

        if consensus_count < min_consensus:
            continue

        evaluated_picks = [d for d in feature_data.values() if d.get("evaluated")]
        avg_return = (
            round(sum(d["return_pct"] * d["direction"] for d in evaluated_picks
                      if d.get("return_pct") is not None) / len(evaluated_picks), 2)
            if evaluated_picks else None
        )

        rows.append({
            "ticker":               ticker,
            "consensus_direction":  consensus_direction,
            "consensus_count":      consensus_count,
            "bull_count":           bull_count,
            "bear_count":           bear_count,
            "avg_directional_return": avg_return,
            "features":             {f: feature_data.get(f) for f in FEATURES},
        })

    rows.sort(key=lambda r: (-r["consensus_count"], r["ticker"]))

    return {
        "timeframe":    timeframe,
        "rows":         rows,
        "total_tickers": len(rows),
        "updated_at":   datetime.now(timezone.utc).isoformat(),
    }


@router.get("/historical-backtest")
def historical_backtest(
    weeks_back: int = Query(1, ge=1, le=4, description="How many weeks back to backtest"),
):
    """
    Run all 4 feature scanners using today's signals, but evaluate them
    against actual price returns from N weeks ago → today.
    Returns win rates, directional returns, and ranked feature standings.
    Takes ~60-90s on first call (options scanner cold).
    """
    from features.leaderboard.scanner import run_historical_backtest
    return run_historical_backtest(weeks_back=weeks_back)


@router.post("/scan")
def trigger_scan(
    timeframe: str = Query("weekly", description="'weekly' or 'monthly'"),
    background_tasks: BackgroundTasks = None,
):
    """Trigger an immediate leaderboard scan (runs in background, returns instantly)."""
    if background_tasks:
        background_tasks.add_task(scanner.run_scan, timeframe)
        return {
            "status":    "started",
            "timeframe": timeframe,
            "message":   f"Leaderboard {timeframe} scan running in background. Check /picks in ~60s.",
        }
    result = scanner.run_scan(timeframe)
    return {"status": "done", **result}
