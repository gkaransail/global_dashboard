import time
from typing import Any, Optional

# Simple in-memory TTL cache shared across all features
_store: dict[str, tuple[Any, float]] = {}


def get(key: str, ttl: int = 300) -> Optional[Any]:
    if key in _store:
        value, ts = _store[key]
        if time.time() - ts < ttl:
            return value
        del _store[key]
    return None


def set(key: str, value: Any) -> None:
    _store[key] = (value, time.time())


def invalidate(key: str) -> None:
    _store.pop(key, None)


def clear() -> None:
    _store.clear()
