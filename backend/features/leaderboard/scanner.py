"""
Leaderboard scanner — runs all 4 feature top-20 scanners and logs predictions to DB.

Each pick becomes a prediction row with:
  feature   = 'options' | 'technical' | 'insider' | 'institutional'
  source    = 'leaderboard:weekly' | 'leaderboard:monthly'
  timeframe = '1w' | '1mo'
  evaluate_after = predicted_at + 7d (weekly) or + 30d (monthly)

The existing evaluator grades them once evaluate_after passes.
"""
import logging
from datetime import datetime, timedelta, timezone

from features.backtest import db

logger = logging.getLogger(__name__)

FEATURES = {
    "options":       ("features.options.analyzers.scanner",    "top20"),
    "technical":     ("features.technical.top20",              "top20"),
    "insider":       ("features.insider.top20",                "top20"),
    "institutional": ("features.institutional.top20",          "top20"),
}


def _import_top20(module_path: str, func_name: str, timeframe: str):
    """Lazy import and call a feature's top20() function."""
    import importlib
    mod = importlib.import_module(module_path)
    fn  = getattr(mod, func_name)
    if module_path == "features.options.analyzers.scanner":
        return fn(timeframe=timeframe)
    return fn()


def run_scan(timeframe: str = "weekly") -> dict:
    """
    Run all 4 feature scanners for the given timeframe and log picks to DB.
    timeframe: 'weekly' → 1w predictions evaluated in 7d
               'monthly' → 1mo predictions evaluated in 30d
    """
    db.init_db()

    tf_key     = "1w" if timeframe == "weekly" else "1mo"
    eval_days  = 7 if timeframe == "weekly" else 30
    source_tag = f"leaderboard:{timeframe}"
    now        = datetime.now(timezone.utc)
    today_str  = now.date().isoformat()
    eval_after = (now + timedelta(days=eval_days)).date().isoformat()

    summary = {}

    for feature_name, (module_path, func_name) in FEATURES.items():
        logged = 0
        skipped = 0
        try:
            result = _import_top20(module_path, func_name, tf_key)
        except Exception as e:
            logger.error(f"Leaderboard scanner: {feature_name} top20 failed: {e}")
            summary[feature_name] = {"error": str(e)}
            continue

        picks = result.get("bullish", []) + result.get("bearish", [])

        for pick in picks:
            ticker = pick.get("ticker")
            if not ticker:
                continue

            if db.leaderboard_prediction_exists(ticker, feature_name, tf_key, today_str):
                skipped += 1
                continue

            try:
                db.insert_prediction({
                    "ticker":            ticker,
                    "timeframe":         tf_key,
                    "predicted_at":      now.isoformat(),
                    "direction":         pick["direction"],
                    "score":             pick.get("score"),
                    "spot_at_prediction": pick.get("spot") or 0,
                    "evaluate_after":    eval_after,
                    "source":            source_tag,
                    "feature":           feature_name,
                })
                logged += 1
            except Exception as e:
                logger.debug(f"Leaderboard insert {feature_name}/{ticker}: {e}")

        summary[feature_name] = {
            "bullish_picks": len(result.get("bullish", [])),
            "bearish_picks": len(result.get("bearish", [])),
            "logged":        logged,
            "skipped":       skipped,
        }
        logger.info(f"[leaderboard] {feature_name}: {logged} logged, {skipped} skipped")

    return {
        "timeframe":  timeframe,
        "scanned_at": now.isoformat(),
        "features":   summary,
    }
