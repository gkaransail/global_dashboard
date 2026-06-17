"""
Evaluates matured predictions by fetching the current spot price and comparing
against what was predicted. Updates prediction records with outcomes.
"""
import logging
import yfinance as yf
from datetime import date, timezone, datetime
from features.backtest import db

logger = logging.getLogger(__name__)


def _fetch_spot(ticker: str) -> float | None:
    try:
        t = yf.Ticker(ticker)
        price = t.fast_info.last_price
        if price and price == price:  # NaN check
            return float(price)
        hist = t.history(period="2d", interval="1d", auto_adjust=True)
        return float(hist["Close"].iloc[-1]) if not hist.empty else None
    except Exception as e:
        logger.debug(f"Spot fetch failed for {ticker}: {e}")
        return None


def evaluate_pending() -> dict:
    """
    Check all predictions whose evaluate_after date has passed.
    Returns a summary of what was evaluated.
    """
    db.init_db()
    today     = date.today().isoformat()
    pending   = db.get_pending_predictions(today)
    evaluated = 0
    errors    = 0

    for pred in pending:
        ticker     = pred["ticker"]
        spot_then  = pred["spot_at_prediction"]
        direction  = pred["direction"]

        spot_now = _fetch_spot(ticker)
        if spot_now is None or not spot_then:
            errors += 1
            continue

        return_pct = round((spot_now - spot_then) / spot_then * 100, 3)

        # Correct if direction matches: bull+positive return, bear+negative return
        # Neutral predictions count as correct if move < 1%
        if direction == 1:
            correct = 1 if return_pct > 0 else 0
        elif direction == -1:
            correct = 1 if return_pct < 0 else 0
        else:
            correct = 1 if abs(return_pct) < 1.0 else 0

        db.mark_evaluated(
            pred_id=pred["id"],
            outcome_at=datetime.now(timezone.utc).isoformat(),
            spot_outcome=round(spot_now, 2),
            return_pct=return_pct,
            correct=correct,
        )
        evaluated += 1
        logger.info(
            f"Evaluated {ticker} {pred['timeframe']}: "
            f"predicted {'bull' if direction==1 else 'bear' if direction==-1 else 'neutral'}, "
            f"actual {return_pct:+.2f}% → {'✓' if correct else '✗'}"
        )

    return {"evaluated": evaluated, "errors": errors, "pending_remaining": len(pending) - evaluated}
