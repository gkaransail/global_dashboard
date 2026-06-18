"""
SQLite persistence for prediction logging and backtesting.
DB file: backend/data/backtest.db
"""
import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
DB_PATH = Path(__file__).parent.parent.parent / "data" / "backtest.db"


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS predictions (
            id                       INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker                   TEXT    NOT NULL,
            timeframe                TEXT    NOT NULL,
            predicted_at             TEXT    NOT NULL,
            direction                INTEGER NOT NULL,  -- 1 bull / -1 bear / 0 neutral
            score                    REAL,
            spot_at_prediction       REAL,
            pc_atm_ratio             REAL,
            pc_vol_ratio             REAL,
            pc_ratio                 REAL,
            iv_rank                  REAL,
            short_pct_float          REAL,
            squeeze_candidate        INTEGER,
            gex_environment          TEXT,
            options_flow_significance TEXT,
            max_pain_pct             REAL,
            expected_move_pct        REAL,
            evaluate_after           TEXT    NOT NULL,  -- ISO date when to check outcome
            evaluated                INTEGER DEFAULT 0,
            outcome_at               TEXT,
            spot_at_outcome          REAL,
            actual_return_pct        REAL,
            correct                  INTEGER,           -- 1 correct / 0 wrong / NULL pending
            source                   TEXT    DEFAULT 'options_analysis'
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            ticker    TEXT PRIMARY KEY,
            added_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS signal_weights (
            signal_name   TEXT    PRIMARY KEY,
            weight        REAL    NOT NULL DEFAULT 1.0,
            base_weight   REAL    NOT NULL DEFAULT 1.0,
            accuracy      REAL,
            sample_count  INTEGER DEFAULT 0,
            updated_at    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_pred_ticker    ON predictions(ticker);
        CREATE INDEX IF NOT EXISTS idx_pred_evaluated ON predictions(evaluated);
        CREATE INDEX IF NOT EXISTS idx_pred_eval_after ON predictions(evaluate_after);
        """)

        # Seed default signal weights (matching current scanner scoring)
        defaults = [
            ("atm_pc_bull",      3.0, 3.0),
            ("atm_pc_bear",      3.0, 3.0),
            ("max_pain_above",   1.0, 1.0),
            ("max_pain_below",   1.0, 1.0),
            ("iv_rank_fear",     1.0, 1.0),
            ("iv_rank_calm",     1.0, 1.0),
            ("squeeze",          1.0, 1.0),
            ("gex_positive",     0.5, 0.5),
            ("gex_negative",     0.5, 0.5),
            ("activity_extreme", 0.5, 0.5),
        ]
        conn.executemany(
            "INSERT OR IGNORE INTO signal_weights(signal_name, weight, base_weight) VALUES (?,?,?)",
            defaults
        )

        # Migrations for existing DBs
        try:
            conn.execute("ALTER TABLE predictions ADD COLUMN source TEXT DEFAULT 'options_analysis'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE predictions ADD COLUMN feature TEXT DEFAULT 'options'")
        except Exception:
            pass


def insert_prediction(p: dict) -> int:
    with _conn() as conn:
        cur = conn.execute("""
            INSERT INTO predictions (
                ticker, timeframe, predicted_at, direction, score,
                spot_at_prediction, pc_atm_ratio, pc_vol_ratio, pc_ratio,
                iv_rank, short_pct_float, squeeze_candidate, gex_environment,
                options_flow_significance, max_pain_pct, expected_move_pct,
                evaluate_after, source, feature
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            p["ticker"], p["timeframe"], p["predicted_at"], p["direction"], p.get("score"),
            p["spot_at_prediction"], p.get("pc_atm_ratio"), p.get("pc_vol_ratio"), p.get("pc_ratio"),
            p.get("iv_rank"), p.get("short_pct_float"), int(p.get("squeeze_candidate") or 0),
            p.get("gex_environment"), p.get("options_flow_significance"),
            p.get("max_pain_pct"), p.get("expected_move_pct"), p["evaluate_after"],
            p.get("source", "options_analysis"),
            p.get("feature", "options"),
        ))
        return cur.lastrowid


def get_pending_predictions(as_of_date: str) -> list[dict]:
    """Return predictions whose evaluate_after date has passed and are not yet evaluated."""
    with _conn() as conn:
        rows = conn.execute("""
            SELECT * FROM predictions
            WHERE evaluated = 0 AND evaluate_after <= ?
            ORDER BY predicted_at ASC
        """, (as_of_date,)).fetchall()
    return [dict(r) for r in rows]


def mark_evaluated(pred_id: int, outcome_at: str, spot_outcome: float,
                   return_pct: float, correct: int):
    with _conn() as conn:
        conn.execute("""
            UPDATE predictions
            SET evaluated=1, outcome_at=?, spot_at_outcome=?,
                actual_return_pct=?, correct=?
            WHERE id=?
        """, (outcome_at, spot_outcome, return_pct, correct, pred_id))


def get_all_evaluated() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM predictions WHERE evaluated=1 ORDER BY predicted_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_pending() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM predictions WHERE evaluated=0 ORDER BY predicted_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_signal_weights() -> dict:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM signal_weights ORDER BY signal_name").fetchall()
    return {r["signal_name"]: dict(r) for r in rows}


def update_signal_weight(signal_name: str, weight: float, accuracy: float, sample_count: int):
    from datetime import datetime, timezone
    with _conn() as conn:
        conn.execute("""
            UPDATE signal_weights
            SET weight=?, accuracy=?, sample_count=?, updated_at=?
            WHERE signal_name=?
        """, (weight, accuracy, sample_count, datetime.now(timezone.utc).isoformat(), signal_name))


def get_stats() -> dict:
    with _conn() as conn:
        total      = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        evaluated  = conn.execute("SELECT COUNT(*) FROM predictions WHERE evaluated=1").fetchone()[0]
        pending    = total - evaluated
        correct    = conn.execute("SELECT COUNT(*) FROM predictions WHERE correct=1").fetchone()[0]
        win_rate   = round(correct / evaluated * 100, 1) if evaluated > 0 else None

        bull_eval  = conn.execute("SELECT COUNT(*) FROM predictions WHERE evaluated=1 AND direction=1").fetchone()[0]
        bull_win   = conn.execute("SELECT COUNT(*) FROM predictions WHERE evaluated=1 AND direction=1 AND correct=1").fetchone()[0]
        bear_eval  = conn.execute("SELECT COUNT(*) FROM predictions WHERE evaluated=1 AND direction=-1").fetchone()[0]
        bear_win   = conn.execute("SELECT COUNT(*) FROM predictions WHERE evaluated=1 AND direction=-1 AND correct=1").fetchone()[0]

        avg_return_row = conn.execute(
            "SELECT AVG(actual_return_pct * direction) FROM predictions WHERE evaluated=1 AND direction!=0"
        ).fetchone()
        avg_return = round(avg_return_row[0], 2) if avg_return_row[0] is not None else None

        by_tf = conn.execute("""
            SELECT timeframe,
                   COUNT(*) as total,
                   SUM(CASE WHEN evaluated=1 THEN 1 ELSE 0 END) as evaluated,
                   SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END) as wins
            FROM predictions GROUP BY timeframe
        """).fetchall()

    return {
        "total_predictions": total,
        "evaluated":         evaluated,
        "pending":           pending,
        "correct":           correct,
        "win_rate_pct":      win_rate,
        "avg_directional_return_pct": avg_return,
        "bull_win_rate": round(bull_win / bull_eval * 100, 1) if bull_eval > 0 else None,
        "bear_win_rate": round(bear_win / bear_eval * 100, 1) if bear_eval > 0 else None,
        "by_timeframe": [dict(r) for r in by_tf],
    }


# ── Leaderboard ───────────────────────────────────────────────────────────────

def get_feature_stats() -> list[dict]:
    """Win rate + accuracy per feature for the leaderboard scoreboard."""
    with _conn() as conn:
        rows = conn.execute("""
            SELECT
                COALESCE(feature, 'options') as feature,
                COUNT(*) as total,
                SUM(CASE WHEN evaluated=1 THEN 1 ELSE 0 END) as evaluated,
                SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END) as correct,
                SUM(CASE WHEN evaluated=1 AND direction=1 THEN 1 ELSE 0 END) as bull_eval,
                SUM(CASE WHEN correct=1 AND direction=1 THEN 1 ELSE 0 END) as bull_wins,
                SUM(CASE WHEN evaluated=1 AND direction=-1 THEN 1 ELSE 0 END) as bear_eval,
                SUM(CASE WHEN correct=1 AND direction=-1 THEN 1 ELSE 0 END) as bear_wins,
                AVG(CASE WHEN evaluated=1 THEN actual_return_pct * direction ELSE NULL END) as avg_directional_return
            FROM predictions
            WHERE source LIKE 'leaderboard%' OR feature IS NOT NULL
            GROUP BY COALESCE(feature, 'options')
            ORDER BY feature
        """).fetchall()
    out = []
    for r in rows:
        ev = r["evaluated"] or 0
        correct = r["correct"] or 0
        bull_eval = r["bull_eval"] or 0
        bear_eval = r["bear_eval"] or 0
        out.append({
            "feature":       r["feature"],
            "total":         r["total"],
            "evaluated":     ev,
            "pending":       r["total"] - ev,
            "win_rate_pct":  round(correct / ev * 100, 1) if ev > 0 else None,
            "bull_win_rate": round(r["bull_wins"] / bull_eval * 100, 1) if bull_eval > 0 else None,
            "bear_win_rate": round(r["bear_wins"] / bear_eval * 100, 1) if bear_eval > 0 else None,
            "avg_return":    round(r["avg_directional_return"], 2) if r["avg_directional_return"] is not None else None,
        })
    return out


def get_feature_picks(timeframe: str, limit: int = 20) -> list[dict]:
    """Most recent picks per feature for a given timeframe, with evaluation results."""
    with _conn() as conn:
        rows = conn.execute("""
            SELECT p.*,
                   ROW_NUMBER() OVER (
                       PARTITION BY feature, ticker, direction
                       ORDER BY predicted_at DESC
                   ) as rn
            FROM predictions p
            WHERE (source LIKE 'leaderboard%' OR feature IS NOT NULL)
              AND timeframe = ?
              AND feature IS NOT NULL
        """, (timeframe,)).fetchall()
    # Keep only the latest per (feature, ticker, direction)
    seen = set()
    results = []
    for r in rows:
        r = dict(r)
        key = (r.get("feature"), r.get("ticker"), r.get("direction"))
        if key not in seen and r.get("rn") == 1:
            seen.add(key)
            results.append(r)
    results.sort(key=lambda x: (x.get("feature") or "", -(x.get("score") or 0)))
    return results[:limit * 4]  # up to limit per feature × 4 features


def leaderboard_prediction_exists(ticker: str, feature: str, timeframe: str, date_str: str) -> bool:
    """Check if a prediction already exists for this ticker+feature+timeframe on this date."""
    with _conn() as conn:
        row = conn.execute("""
            SELECT id FROM predictions
            WHERE ticker=? AND feature=? AND timeframe=?
              AND DATE(predicted_at)=?
        """, (ticker, feature, timeframe, date_str)).fetchone()
    return row is not None


# ── Watchlist ─────────────────────────────────────────────────────────────────

def get_watchlist() -> list[str]:
    with _conn() as conn:
        rows = conn.execute("SELECT ticker FROM watchlist ORDER BY added_at").fetchall()
    return [r["ticker"] for r in rows]


def set_watchlist(tickers: list[str]):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute("DELETE FROM watchlist")
        conn.executemany(
            "INSERT INTO watchlist(ticker, added_at) VALUES (?, ?)",
            [(t.upper(), now) for t in tickers]
        )


def add_to_watchlist(ticker: str):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist(ticker, added_at) VALUES (?, ?)",
            (ticker.upper(), now)
        )


def remove_from_watchlist(ticker: str):
    with _conn() as conn:
        conn.execute("DELETE FROM watchlist WHERE ticker=?", (ticker.upper(),))
