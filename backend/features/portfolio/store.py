"""JSON-file persistence for portfolio positions."""
import json
import uuid
from pathlib import Path
from datetime import date

DATA_FILE = Path(__file__).parent.parent.parent / "data" / "portfolio.json"


def _load() -> list:
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return []


def _save(positions: list) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(positions, indent=2))


def get_all() -> list:
    return _load()


def add_position(ticker: str, shares: float, cost_basis: float, added_date: str | None = None) -> dict:
    positions = _load()
    position = {
        "id": str(uuid.uuid4())[:8],
        "ticker": ticker.upper(),
        "shares": shares,
        "cost_basis": cost_basis,
        "added_date": added_date or str(date.today()),
    }
    positions.append(position)
    _save(positions)
    return position


def remove_position(position_id: str) -> bool:
    positions = _load()
    new = [p for p in positions if p["id"] != position_id]
    if len(new) == len(positions):
        return False
    _save(new)
    return True


def update_position(position_id: str, shares: float | None = None, cost_basis: float | None = None) -> dict | None:
    positions = _load()
    for p in positions:
        if p["id"] == position_id:
            if shares is not None:
                p["shares"] = shares
            if cost_basis is not None:
                p["cost_basis"] = cost_basis
            _save(positions)
            return p
    return None
