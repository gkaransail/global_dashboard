"""
Prediction collector — hooks into get_analysis() to log predictions automatically.
Only logs a fresh prediction if we haven't logged one for this ticker+timeframe today.
"""
import logging
from datetime import datetime, date, timedelta, timezone
from features.backtest import db

logger = logging.getLogger(__name__)

TIMEFRAME_EVAL_DAYS = {
    "1h":  1, "1d": 3, "1w": 7, "1mo": 30,
    "3mo": 90, "6mo": 180, "1y": 365,
}


def _direction(score: float) -> int:
    if score is None:
        return 0
    if score > 0:
        return 1
    if score < 0:
        return -1
    return 0


def _already_logged_today(ticker: str, timeframe: str) -> bool:
    """Avoid duplicate logs for the same ticker+timeframe within a calendar day."""
    import sqlite3
    from features.backtest.db import _conn
    today = date.today().isoformat()
    with _conn() as conn:
        row = conn.execute("""
            SELECT id FROM predictions
            WHERE ticker=? AND timeframe=? AND DATE(predicted_at)=?
            LIMIT 1
        """, (ticker, timeframe, today)).fetchone()
    return row is not None


def log_prediction(analysis: dict, source: str = "options_analysis"):
    """
    Called from get_analysis() after computing a fresh result.
    Stores the current signals + predicted direction for later evaluation.
    """
    try:
        db.init_db()
        ticker    = analysis.get("ticker", "")
        timeframe = analysis.get("timeframe", "")
        if not ticker or not timeframe:
            return
        if _already_logged_today(ticker, timeframe):
            return

        # Derive score from signals (mirrors scanner scoring)
        pc = analysis.get("pc_atm_ratio") or analysis.get("pc_vol_ratio") or analysis.get("pc_ratio")
        score = 0
        if pc is not None:
            if pc < 0.6:   score += 3
            elif pc < 0.8: score += 2
            elif pc < 1.0: score += 1
            elif pc < 1.2: score -= 1
            elif pc < 1.5: score -= 2
            else:           score -= 3

        spot = analysis.get("spot_price") or 0
        max_pain = analysis.get("max_pain")
        if max_pain and spot:
            gap = (max_pain - spot) / spot
            if gap > 0.02:   score += 1
            elif gap < -0.02: score -= 1

        iv_rank = analysis.get("iv_rank")
        if iv_rank is not None:
            if iv_rank > 70:  score -= 1
            elif iv_rank < 25: score += 1

        if analysis.get("squeeze_candidate"):
            score += 1

        score = max(-5, min(5, score))

        eval_days = TIMEFRAME_EVAL_DAYS.get(timeframe, 7)
        eval_date = (date.today() + timedelta(days=eval_days)).isoformat()

        em = analysis.get("expected_move") or {}
        mp_pct = round((max_pain - spot) / spot * 100, 2) if max_pain and spot else None

        db.insert_prediction({
            "ticker":               ticker,
            "timeframe":            timeframe,
            "predicted_at":         datetime.now(timezone.utc).isoformat(),
            "direction":            _direction(score),
            "score":                score,
            "spot_at_prediction":   spot,
            "pc_atm_ratio":         analysis.get("pc_atm_ratio"),
            "pc_vol_ratio":         analysis.get("pc_vol_ratio"),
            "pc_ratio":             analysis.get("pc_ratio"),
            "iv_rank":              iv_rank,
            "short_pct_float":      analysis.get("short_pct_float"),
            "squeeze_candidate":    analysis.get("squeeze_candidate"),
            "gex_environment":      (analysis.get("gex") or {}).get("environment"),
            "options_flow_significance": analysis.get("options_flow_significance"),
            "max_pain_pct":         mp_pct,
            "expected_move_pct":    em.get("move_pct"),
            "evaluate_after":       eval_date,
            "source":               source,
        })
        logger.debug(f"Logged prediction: {ticker} {timeframe} score={score}")
    except Exception as e:
        logger.debug(f"Prediction log failed: {e}")
