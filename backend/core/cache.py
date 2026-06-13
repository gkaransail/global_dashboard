"""
Cache with Supabase persistence + in-memory fallback.

If SUPABASE_URL and SUPABASE_KEY are set in .env, all cached data
persists across PM2 restarts and is shared across processes.

Falls back to the original in-memory dict if Supabase is not configured
or temporarily unavailable — the app always works either way.

Supabase table required (run supabase_setup.sql in your Supabase SQL editor):
  create table cache (
    key        text primary key,
    value      jsonb not null,
    created_at timestamptz not null default now()
  );
"""
import time
import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── In-memory fallback ────────────────────────────────────────────────────────
_store: dict[str, tuple[Any, float]] = {}

# ── Supabase client (lazy init, cached after first call) ─────────────────────
_sb        = None
_sb_ready: Optional[bool] = None   # None = not yet checked


def _supabase():
    """Return Supabase client or None. Tries once, caches the result."""
    global _sb, _sb_ready
    if _sb_ready is False:
        return None
    if _sb is not None:
        return _sb
    try:
        from core.config import settings
        if not settings.supabase_url or not settings.supabase_key:
            _sb_ready = False
            return None
        from supabase import create_client
        _sb = create_client(settings.supabase_url, settings.supabase_key)
        _sb_ready = True
        logger.info("Cache: Supabase persistence active")
        return _sb
    except Exception as e:
        logger.warning(f"Cache: Supabase unavailable ({e}) — using in-memory fallback")
        _sb_ready = False
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def get(key: str, ttl: int = 300) -> Optional[Any]:
    """Return cached value if it exists and is younger than `ttl` seconds."""
    sb = _supabase()
    if sb:
        try:
            res = (
                sb.table("cache")
                .select("value,created_at")
                .eq("key", key)
                .maybe_single()
                .execute()
            )
            if res.data:
                created = datetime.fromisoformat(
                    res.data["created_at"].replace("Z", "+00:00")
                )
                age = (datetime.now(timezone.utc) - created).total_seconds()
                if age < ttl:
                    return res.data["value"]
            return None
        except Exception as e:
            logger.debug(f"Cache get error (Supabase): {e}")
            # fall through to in-memory

    if key in _store:
        value, ts = _store[key]
        if time.time() - ts < ttl:
            return value
        del _store[key]
    return None


def set(key: str, value: Any) -> None:
    """Store a value. TTL is enforced on read via get()."""
    sb = _supabase()
    if sb:
        try:
            sb.table("cache").upsert({
                "key":        key,
                "value":      value,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            return
        except Exception as e:
            logger.debug(f"Cache set error (Supabase): {e}")
            # fall through to in-memory

    _store[key] = (value, time.time())


def invalidate(key: str) -> None:
    sb = _supabase()
    if sb:
        try:
            sb.table("cache").delete().eq("key", key).execute()
        except Exception as e:
            logger.debug(f"Cache invalidate error (Supabase): {e}")
    _store.pop(key, None)


def clear() -> None:
    sb = _supabase()
    if sb:
        try:
            sb.table("cache").delete().neq("key", "__sentinel__").execute()
        except Exception as e:
            logger.debug(f"Cache clear error (Supabase): {e}")
    _store.clear()
