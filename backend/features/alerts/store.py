"""JSON-file persistence for alerts and watchlist."""
import json
import uuid
from pathlib import Path
from datetime import datetime

DATA_FILE = Path(__file__).parent.parent.parent / "data" / "alerts.json"
WATCHLIST_FILE = Path(__file__).parent.parent.parent / "data" / "watchlist.json"


def _load(path: Path) -> list:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except Exception:
        return []


def _save(path: Path, data: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


# ── Watchlist ─────────────────────────────────────────────────────────────

def get_watchlist() -> list:
    return _load(WATCHLIST_FILE)


def add_to_watchlist(ticker: str) -> dict:
    items = _load(WATCHLIST_FILE)
    ticker = ticker.upper()
    if any(i["ticker"] == ticker for i in items):
        return next(i for i in items if i["ticker"] == ticker)
    item = {"ticker": ticker, "added": datetime.utcnow().isoformat() + "Z"}
    items.append(item)
    _save(WATCHLIST_FILE, items)
    return item


def remove_from_watchlist(ticker: str) -> bool:
    items = _load(WATCHLIST_FILE)
    new = [i for i in items if i["ticker"] != ticker.upper()]
    if len(new) == len(items):
        return False
    _save(WATCHLIST_FILE, new)
    return True


# ── Alerts ────────────────────────────────────────────────────────────────

def get_alerts() -> list:
    return _load(DATA_FILE)


def add_alert(ticker: str, alert_type: str, condition: str, value: float, note: str = "") -> dict:
    alerts = _load(DATA_FILE)
    alert = {
        "id": str(uuid.uuid4())[:8],
        "ticker": ticker.upper(),
        "type": alert_type,       # price | reversal_confidence | smart_money_score
        "condition": condition,   # above | below
        "value": value,
        "note": note,
        "created": datetime.utcnow().isoformat() + "Z",
        "triggered": False,
        "triggered_at": None,
    }
    alerts.append(alert)
    _save(DATA_FILE, alerts)
    return alert


def remove_alert(alert_id: str) -> bool:
    alerts = _load(DATA_FILE)
    new = [a for a in alerts if a["id"] != alert_id]
    if len(new) == len(alerts):
        return False
    _save(DATA_FILE, new)
    return True


def mark_triggered(alert_id: str) -> None:
    alerts = _load(DATA_FILE)
    for a in alerts:
        if a["id"] == alert_id:
            a["triggered"] = True
            a["triggered_at"] = datetime.utcnow().isoformat() + "Z"
    _save(DATA_FILE, alerts)


def reset_alert(alert_id: str) -> None:
    alerts = _load(DATA_FILE)
    for a in alerts:
        if a["id"] == alert_id:
            a["triggered"] = False
            a["triggered_at"] = None
    _save(DATA_FILE, alerts)
