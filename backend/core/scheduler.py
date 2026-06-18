"""
Background warm-up scheduler.

HOW IT WORKS
────────────
The dashboard uses an in-memory TTL cache. On the first request after a cache
miss, FastAPI fetches live data — which can take 5-45 seconds depending on
the feature. After that the response is instant.

Problem: if no one hits the endpoint for a while, the cache expires and the
next visitor pays the full fetch cost again ("cold cache hit").

Solution: run background jobs that pre-fetch data on a fixed schedule, just
*before* the TTL expires. The cache never goes cold — every user always gets
a cached response.

This pattern is called "cache warming" or "read-through pre-population".

JOB SCHEDULE (aligned to cache TTLs)
──────────────────────────────────────
  Job                     Interval   Cache TTL   Rationale
  ─────────────────────── ────────   ─────────   ────────────────────────────
  screener_full_scan      25 min     30 min      Most expensive job (~45s)
  smart_money_scan        50 min     60 min      Options/insider/institutional
  technical_screener      4 min      5 min       Fast OHLCV + indicators
  news_sentiment          12 min     15 min      FinBERT on top-20 tickers
  options_top_tickers     4 min      5 min       Live options chain for top 10

Each interval is set slightly shorter than the TTL so the warm job always
completes before the cached data expires.

ARCHITECTURE
────────────
  APScheduler BackgroundScheduler
    └── runs in a daemon thread (doesn't block the FastAPI event loop)
    └── calls the same Python functions the API endpoints call
    └── since those functions write to the shared TTL cache, subsequent
        HTTP requests hit the warm cache immediately

  FastAPI lifespan
    └── scheduler.start() when the app boots
    └── scheduler.shutdown() when the app exits (graceful)

ADDING A NEW JOB
────────────────
  1. Write a plain Python function that calls the expensive data fetch.
  2. Add it to _register_jobs() with an IntervalTrigger.
  3. Done — the scheduler handles threading, error isolation, and logging.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED

logger = logging.getLogger(__name__)

# ── Tickers to pre-warm individually ──────────────────────────────────────────
# These are the highest-traffic tickers — pre-warmed every cycle so their
# options, news, and technical data is always cache-hot.
TOP_TICKERS = [
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN",
    "META", "GOOGL", "AMD",  "SPY",  "QQQ",
    "JPM",  "V",    "NFLX", "COIN", "PLTR",
]


# ── Job definitions ───────────────────────────────────────────────────────────

def _warm_screener():
    """Pre-warm the multi-factor screener full scan (most expensive: ~45s on cold cache)."""
    try:
        from features.screener.engine import run_scan
        result = run_scan()
        logger.info(f"[warm] screener scan complete — {result['total']} tickers scored")
    except Exception as e:
        logger.error(f"[warm] screener scan failed: {e}")


def _warm_smart_money():
    """Pre-warm the smart money scanner (options + insider + institutional)."""
    try:
        from features.smart_money.scanner import run_scan
        result = run_scan()
        logger.info(f"[warm] smart money scan complete — scanned {result.get('scanned', '?')} tickers")
    except Exception as e:
        logger.error(f"[warm] smart money scan failed: {e}")


def _warm_technical_screener():
    """Pre-warm technical screener with the default conditions so the table loads instantly."""
    try:
        from features.technical.analyzer import get_screener
        result = get_screener(conditions=[])   # no filter = scan all
        logger.info(f"[warm] technical screener complete — {result.get('total_found', '?')} results")
    except Exception as e:
        logger.error(f"[warm] technical screener failed: {e}")


def _warm_news_sentiment():
    """Pre-warm FinBERT news sentiment for top tickers."""
    try:
        from core.news import fetch_ticker_news
        from features.sentiment_ai.finbert import analyze_news_articles
        from core import cache as _cache

        for ticker in TOP_TICKERS:
            try:
                cache_key = f"sentiment_ai_news_{ticker}_15"
                if _cache.get(cache_key, ttl=900):
                    continue  # still warm, skip
                articles = fetch_ticker_news(ticker, max_items=15)
                if articles:
                    result = analyze_news_articles(articles)
                    result["ticker"] = ticker
                    _cache.set(cache_key, result)
            except Exception as e:
                logger.debug(f"[warm] sentiment {ticker}: {e}")

        logger.info(f"[warm] news sentiment warmed for {len(TOP_TICKERS)} tickers")
    except Exception as e:
        logger.error(f"[warm] news sentiment failed: {e}")


def _leaderboard_weekly_scan():
    """Log weekly Top-20 picks from all 4 feature scanners into the predictions DB."""
    try:
        from features.leaderboard.scanner import run_scan
        result = run_scan("weekly")
        total = sum(v.get("logged", 0) for v in result.get("features", {}).values() if isinstance(v, dict))
        logger.info(f"[leaderboard] weekly scan complete — {total} predictions logged")
    except Exception as e:
        logger.error(f"[leaderboard] weekly scan failed: {e}")


def _leaderboard_monthly_scan():
    """Log monthly Top-20 picks from all 4 feature scanners into the predictions DB."""
    try:
        from features.leaderboard.scanner import run_scan
        result = run_scan("monthly")
        total = sum(v.get("logged", 0) for v in result.get("features", {}).values() if isinstance(v, dict))
        logger.info(f"[leaderboard] monthly scan complete — {total} predictions logged")
    except Exception as e:
        logger.error(f"[leaderboard] monthly scan failed: {e}")


def _warm_options_top():
    """Pre-warm options analysis (IV rank, chain summary) for top tickers."""
    try:
        from features.options.analyzers.analysis import get_analysis

        warmed = 0
        for ticker in TOP_TICKERS[:10]:  # options data is heavy; only top 10
            try:
                get_analysis(ticker)
                warmed += 1
            except Exception as e:
                logger.debug(f"[warm] options {ticker}: {e}")

        logger.info(f"[warm] options analysis warmed for {warmed} tickers")
    except Exception as e:
        logger.error(f"[warm] options warm failed: {e}")


# ── Scheduler singleton ───────────────────────────────────────────────────────

_scheduler: Optional[BackgroundScheduler] = None
_job_stats: dict[str, dict] = {}   # tracks last run time + status per job


def _on_job_executed(event):
    _job_stats[event.job_id] = {
        "last_run":    datetime.now(timezone.utc).isoformat(),
        "status":      "ok",
        "next_run":    None,
    }


def _on_job_error(event):
    _job_stats[event.job_id] = {
        "last_run":    datetime.now(timezone.utc).isoformat(),
        "status":      f"error: {event.exception}",
        "next_run":    None,
    }


def _register_jobs(scheduler: BackgroundScheduler) -> None:
    """
    Register all warm-up jobs.

    IntervalTrigger(minutes=N)  — fires every N minutes
    jitter=60                   — adds random ±60s to prevent all jobs firing
                                  at the exact same second (thundering herd)
    max_instances=1             — if a job is still running when the next
                                  trigger fires, skip rather than overlap
    """
    jobs = [
        # id                      func                        interval   jitter
        ("screener_full_scan",    _warm_screener,             25,        120),
        ("smart_money_scan",      _warm_smart_money,          50,        120),
        ("technical_screener",    _warm_technical_screener,   4,         30),
        ("news_sentiment",        _warm_news_sentiment,       12,        60),
        ("options_top_tickers",   _warm_options_top,          4,         30),
    ]

    for job_id, func, interval_minutes, jitter_seconds in jobs:
        scheduler.add_job(
            func,
            trigger=IntervalTrigger(minutes=interval_minutes, jitter=jitter_seconds),
            id=job_id,
            name=job_id,
            max_instances=1,
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc),
        )
        _job_stats[job_id] = {"last_run": None, "status": "pending", "next_run": None}
        logger.info(f"[scheduler] registered: {job_id} every {interval_minutes}m")

    # Leaderboard scans — cron-based (weekly Monday 6am UTC, monthly 1st 6am UTC)
    cron_jobs = [
        ("leaderboard_weekly",  _leaderboard_weekly_scan,  CronTrigger(day_of_week="mon", hour=6, minute=0, timezone="UTC")),
        ("leaderboard_monthly", _leaderboard_monthly_scan, CronTrigger(day=1,             hour=6, minute=0, timezone="UTC")),
    ]
    for job_id, func, trigger in cron_jobs:
        scheduler.add_job(func, trigger=trigger, id=job_id, name=job_id,
                          max_instances=1, replace_existing=True)
        _job_stats[job_id] = {"last_run": None, "status": "pending", "next_run": None}
        logger.info(f"[scheduler] registered: {job_id} (cron)")


def start() -> BackgroundScheduler:
    """
    Start the background scheduler. Call this once at app startup.

    BackgroundScheduler runs in a daemon thread — it doesn't block the
    FastAPI event loop and will be cleaned up automatically when the process
    exits. Call shutdown() explicitly for graceful drain.
    """
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(
        job_defaults={
            "coalesce":      True,   # if a job missed multiple triggers, run once
            "max_instances": 1,
        },
        timezone="UTC",
    )

    # Hook into execution events to track job history
    _scheduler.add_listener(_on_job_executed, EVENT_JOB_EXECUTED)
    _scheduler.add_listener(_on_job_error,    EVENT_JOB_ERROR)

    _register_jobs(_scheduler)
    _scheduler.start()
    logger.info("[scheduler] started — all warm-up jobs registered")
    return _scheduler


def shutdown() -> None:
    """Graceful shutdown: wait for running jobs to finish (wait=True)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("[scheduler] stopped")


def get_status() -> dict:
    """Return current job schedule for the /scheduler/status endpoint."""
    if not _scheduler:
        return {"running": False, "jobs": []}

    jobs = []
    for job in _scheduler.get_jobs():
        stat = _job_stats.get(job.id, {})
        next_run = job.next_run_time
        jobs.append({
            "id":        job.id,
            "last_run":  stat.get("last_run"),
            "status":    stat.get("status", "pending"),
            "next_run":  next_run.isoformat() if next_run else None,
        })

    return {
        "running": _scheduler.running,
        "jobs":    jobs,
    }
