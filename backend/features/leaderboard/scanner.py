"""
Leaderboard scanner — runs all 4 feature top-20 scanners, logs predictions to DB,
and provides a historical backtest that evaluates last week's signals against actual returns.

Each pick becomes a prediction row with:
  feature   = 'options' | 'technical' | 'insider' | 'institutional'
  source    = 'leaderboard:weekly' | 'leaderboard:monthly'
  timeframe = '1w' | '1mo'
  evaluate_after = predicted_at + 7d (weekly) or + 30d (monthly)

The existing evaluator grades them once evaluate_after passes.
"""
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import yfinance as yf
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
        # Pre-fetch spots for any pick missing a price (institutional returns None)
        missing_spot = [p["ticker"] for p in picks if not p.get("spot")]
        spot_cache: dict[str, float] = {}
        for ticker in missing_spot:
            try:
                spot_cache[ticker] = float(yf.Ticker(ticker).fast_info.last_price or 0)
            except Exception:
                spot_cache[ticker] = 0.0

        for pick in picks:
            ticker = pick.get("ticker")
            if not ticker:
                continue

            if db.leaderboard_prediction_exists(ticker, feature_name, tf_key, today_str):
                skipped += 1
                continue

            spot = pick.get("spot") or spot_cache.get(ticker, 0.0)

            try:
                db.insert_prediction({
                    "ticker":            ticker,
                    "timeframe":         tf_key,
                    "predicted_at":      now.isoformat(),
                    "direction":         pick["direction"],
                    "score":             pick.get("score"),
                    "spot_at_prediction": spot,
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


def _fetch_historical_prices(ticker: str, trading_days_back: int) -> tuple | None:
    """
    Returns (ticker, entry_price, exit_price) where:
      entry_price = close price ~trading_days_back trading days ago
      exit_price  = today's last price
    """
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="20d")
        if len(hist) < trading_days_back + 2:
            return None
        entry = float(hist["Close"].iloc[-(trading_days_back + 1)])
        if not entry or math.isnan(entry) or entry <= 0:
            return None
        try:
            exit_price = float(t.fast_info.last_price or hist["Close"].iloc[-1])
        except Exception:
            exit_price = float(hist["Close"].iloc[-1])
        if not exit_price or math.isnan(exit_price):
            return None
        return ticker, round(entry, 2), round(exit_price, 2)
    except Exception as e:
        logger.debug(f"Historical price {ticker}: {e}")
        return None


def run_historical_backtest(weeks_back: int = 1) -> dict:
    """
    Backtest all 4 feature scanners over the past N weeks.

    Uses today's signals (best available proxy for last week's signals),
    fetches actual entry prices from N weeks ago, and evaluates against
    today's price to compute real returns.

    Does NOT write to the DB — pure computation, returns results directly.
    """
    tf_key = "1w"
    trading_days_back = weeks_back * 5  # 5 trading days per week

    # ── Step 1: Run all 4 top20 scanners ─────────────────────────────────────
    all_picks: dict[str, dict] = {}
    for feature_name, (module_path, func_name) in FEATURES.items():
        try:
            all_picks[feature_name] = _import_top20(module_path, func_name, tf_key)
            logger.info(f"[historical] {feature_name} scan OK: "
                        f"{len(all_picks[feature_name].get('bullish',[]))} bull "
                        f"{len(all_picks[feature_name].get('bearish',[]))} bear")
        except Exception as e:
            logger.error(f"[historical] {feature_name} scan failed: {e}")
            all_picks[feature_name] = {"bullish": [], "bearish": []}

    # ── Step 2: Collect unique tickers and fetch historical prices ────────────
    all_tickers: set[str] = set()
    for feat_data in all_picks.values():
        for pick in feat_data.get("bullish", []) + feat_data.get("bearish", []):
            if pick.get("ticker"):
                all_tickers.add(pick["ticker"])

    price_map: dict[str, tuple[float, float]] = {}  # ticker → (entry, exit)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(_fetch_historical_prices, t, trading_days_back): t
                   for t in all_tickers}
        for future in as_completed(futures, timeout=120):
            try:
                result = future.result(timeout=20)
                if result:
                    ticker, entry, exit_price = result
                    price_map[ticker] = (entry, exit_price)
            except Exception as e:
                logger.debug(f"[historical] price future: {e}")

    # ── Step 3: Score each feature's picks ────────────────────────────────────
    now = datetime.now(timezone.utc)
    entry_date = (now - timedelta(days=weeks_back * 7)).date().isoformat()
    exit_date  = now.date().isoformat()

    feature_results: dict[str, dict] = {}

    for feature_name, feat_data in all_picks.items():
        picks_out = []
        for direction_key, direction_val in [("bullish", 1), ("bearish", -1)]:
            for pick in feat_data.get(direction_key, []):
                ticker = pick.get("ticker")
                if not ticker or ticker not in price_map:
                    continue
                entry, exit_price = price_map[ticker]
                return_pct = round((exit_price - entry) / entry * 100, 3)
                directional = round(return_pct * direction_val, 3)

                if direction_val == 1:
                    correct = 1 if return_pct > 0 else 0
                elif direction_val == -1:
                    correct = 1 if return_pct < 0 else 0
                else:
                    correct = 1 if abs(return_pct) < 1.0 else 0

                picks_out.append({
                    "ticker":               ticker,
                    "direction":            direction_val,
                    "score":                pick.get("score"),
                    "signals":              pick.get("signals", [])[:2],
                    "entry":                entry,
                    "exit":                 exit_price,
                    "return_pct":           return_pct,
                    "directional_return":   directional,
                    "correct":              correct,
                })

        # Sort by directional return descending (best call first)
        picks_out.sort(key=lambda p: p["directional_return"], reverse=True)

        total   = len(picks_out)
        correct = sum(p["correct"] for p in picks_out)
        bull    = [p for p in picks_out if p["direction"] == 1]
        bear    = [p for p in picks_out if p["direction"] == -1]
        avg_dr  = round(sum(p["directional_return"] for p in picks_out) / total, 2) if total else None

        feature_results[feature_name] = {
            "total":               total,
            "correct":             correct,
            "win_rate":            round(correct / total * 100, 1) if total else None,
            "bull_total":          len(bull),
            "bull_correct":        sum(p["correct"] for p in bull),
            "bull_win_rate":       round(sum(p["correct"] for p in bull) / len(bull) * 100, 1) if bull else None,
            "bear_total":          len(bear),
            "bear_correct":        sum(p["correct"] for p in bear),
            "bear_win_rate":       round(sum(p["correct"] for p in bear) / len(bear) * 100, 1) if bear else None,
            "avg_directional_return": avg_dr,
            "picks":               picks_out,
        }

    # ── Rank features by win rate ──────────────────────────────────────────────
    ranked = sorted(
        feature_results.items(),
        key=lambda kv: kv[1].get("win_rate") or -1,
        reverse=True,
    )

    return {
        "weeks_back":    weeks_back,
        "entry_date":    entry_date,
        "exit_date":     exit_date,
        "trading_days":  trading_days_back,
        "tickers_priced": len(price_map),
        "ran_at":        now.isoformat(),
        "features":      feature_results,
        "ranking":       [{"rank": i + 1, "feature": k, **v} for i, (k, v) in enumerate(ranked)],
    }
