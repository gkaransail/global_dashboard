"""Check alert conditions against live data."""
import logging
import yfinance as yf
from features.alerts import store

logger = logging.getLogger(__name__)


def _get_price(ticker: str) -> float | None:
    try:
        return float(yf.Ticker(ticker).fast_info.last_price)
    except Exception:
        return None


def check_all() -> list[dict]:
    """Check every untriggered alert and return those that fired."""
    alerts = store.get_alerts()
    triggered = []

    for alert in alerts:
        if alert["triggered"]:
            continue
        try:
            fired = _check_one(alert)
            if fired:
                store.mark_triggered(alert["id"])
                alert["triggered"] = True
                triggered.append(alert)
        except Exception as e:
            logger.debug(f"Alert check failed for {alert['id']}: {e}")

    return triggered


def _check_one(alert: dict) -> bool:
    ticker = alert["ticker"]
    condition = alert["condition"]  # above | below
    threshold = float(alert["value"])
    alert_type = alert["type"]

    if alert_type == "price":
        current = _get_price(ticker)
        if current is None:
            return False
        return current > threshold if condition == "above" else current < threshold

    if alert_type == "reversal_confidence":
        try:
            from features.reversal.router import _run_reversal
            result = _run_reversal(ticker)
            current = float(result.get("confidence", 0))
        except Exception:
            return False
        return current > threshold if condition == "above" else current < threshold

    if alert_type == "smart_money_score":
        try:
            from features.smart_money.scanner import _score_ticker
            result = _score_ticker(ticker)
            if not result:
                return False
            current = float(result["composite_score"])
        except Exception:
            return False
        return current > threshold if condition == "above" else current < threshold

    return False


def get_watchlist_quotes(tickers: list[str]) -> list[dict]:
    """Return current price + daily change for watchlist tickers."""
    results = []
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            info = t.fast_info
            price = float(info.last_price)
            prev = float(info.previous_close or price)
            change_pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
            results.append({
                "ticker": ticker,
                "price": round(price, 2),
                "change_pct": change_pct,
                "change_abs": round(price - prev, 2),
            })
        except Exception:
            results.append({"ticker": ticker, "price": None, "change_pct": None, "change_abs": None})
    return results
