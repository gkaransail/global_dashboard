# Background Cache Warm-Up Scheduler

## What It Is

The scheduler is an **APScheduler BackgroundScheduler** — a Python library that runs jobs in a background daemon thread alongside FastAPI, without blocking the web server's event loop.

**Library:** `apscheduler>=3.10.0`  
**File:** `backend/core/scheduler.py`  
**Pattern name:** *Cache warming* (also called *read-through pre-population*)

---

## Why It Exists

The dashboard uses an in-memory TTL cache (`core/cache.py`). On the first request after a cache entry expires, FastAPI fetches live data — which takes anywhere from 2 seconds (price data) to 45 seconds (full screener scan across 53 tickers). After that, all responses are instant.

**The problem:** if no one hits an endpoint for longer than the TTL, the next user pays the full cold-fetch cost.

**The solution:** background jobs re-fetch data on a fixed schedule, timed to fire just *before* the TTL expires. The cache never goes cold.

```
Without warming                     With warming
────────────────                    ─────────────────────
Request → cache miss                Background job fires at T-5min
  → fetch live data (45s)           → populates cache silently
  → user waits 45s                  Request → cache hit → instant
```

---

## Architecture

```
FastAPI process
│
├── main event loop  (handles HTTP requests)
│
└── BackgroundScheduler (daemon thread, separate from event loop)
      ├── Job: screener_full_scan    → every 25 min
      ├── Job: smart_money_scan      → every 50 min
      ├── Job: technical_screener    → every 4 min
      ├── Job: news_sentiment        → every 12 min
      └── Job: options_top_tickers   → every 4 min
```

Each job calls the **same Python function** the API endpoint calls. Since those functions write to the shared in-memory cache dict, the next HTTP request finds the cache pre-populated.

---

## Job Schedule

| Job ID | What it warms | Interval | Cache TTL | Buffer |
|--------|--------------|----------|-----------|--------|
| `screener_full_scan` | Multi-factor screener (53 tickers × 4 signals) | 25 min | 30 min | 5 min |
| `smart_money_scan` | Options + insider + institutional scan | 50 min | 60 min | 10 min |
| `technical_screener` | RSI, MACD, EMA conditions for 50 tickers | 4 min | 5 min | 1 min |
| `news_sentiment` | FinBERT on top-15 tickers | 12 min | 15 min | 3 min |
| `options_top_tickers` | Options chain + IV rank for top 10 | 4 min | 5 min | 1 min |

---

## How It's Wired Into FastAPI

FastAPI's **lifespan** context manager replaces the old `@app.on_event("startup")` pattern. Code before `yield` runs at startup; code after `yield` runs at shutdown.

```python
# backend/main.py

from contextlib import asynccontextmanager
from core import scheduler as _scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    _scheduler.start()   # ← fires all warm-up jobs immediately + schedules repeats
    yield
    _scheduler.shutdown()  # ← waits for running jobs to finish before exit

app = FastAPI(lifespan=lifespan)
```

---

## Key APScheduler Concepts Used

### BackgroundScheduler
Runs jobs in a **daemon thread** — it lives alongside the main process and is automatically cleaned up when the process exits. Does not block the async event loop.

```python
from apscheduler.schedulers.background import BackgroundScheduler
scheduler = BackgroundScheduler(timezone="UTC")
scheduler.start()
```

### IntervalTrigger
Fires a job repeatedly at a fixed time interval.

```python
from apscheduler.triggers.interval import IntervalTrigger

scheduler.add_job(
    my_function,
    trigger=IntervalTrigger(minutes=25, jitter=120),  # ± 2 min random offset
    id="screener_full_scan",
    max_instances=1,          # skip if previous run is still active
    next_run_time=datetime.now(timezone.utc),  # fire immediately at startup
)
```

### `jitter`
Adds a random ±N second offset to each trigger. Prevents all jobs from firing at the exact same second when the server starts (thundering herd problem).

### `max_instances=1`
If the previous run of a job is still in progress when the next trigger fires, skip this cycle rather than run two instances in parallel.

### `coalesce=True`
If a job missed multiple trigger windows (e.g., the server was overloaded), run it once rather than catching up on every missed run.

### Event listeners
Used to track job history (last run time, success/failure) for the status endpoint:

```python
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED

scheduler.add_listener(on_executed, EVENT_JOB_EXECUTED)
scheduler.add_listener(on_error,    EVENT_JOB_ERROR)
```

---

## Status Endpoint

```
GET /api/v1/scheduler/status
```

Returns all jobs with `last_run`, `status` (ok / error / pending), and `next_run`.  
Also visible in the dashboard under **Multi-Factor Screener → ⏰ Scheduler** (auto-refreshes every 15s).

---

## Adding a New Warm-Up Job

1. Write a plain Python function that calls the expensive data fetch:

```python
# backend/core/scheduler.py

def _warm_my_feature():
    try:
        from features.my_feature.analyzer import get_expensive_data
        result = get_expensive_data()
        logger.info(f"[warm] my_feature complete — {len(result)} items")
    except Exception as e:
        logger.error(f"[warm] my_feature failed: {e}")
```

2. Register it in `_register_jobs()`:

```python
("my_feature_job", _warm_my_feature, 20, 60),
# (job_id,         function,         interval_minutes, jitter_seconds)
```

3. Restart the backend. The job will fire immediately and then every 20 minutes.

---

## Keeping the Dashboard Running Continuously

### Option 1 — Quick (development)
```bash
cd backend
nohup .venv/bin/uvicorn main:app --port 8000 > backend.log 2>&1 &
```
Runs in the background; `tail -f backend.log` to watch scheduler output.

### Option 2 — Production-grade with PM2
```bash
npm install -g pm2
pm2 start ".venv/bin/uvicorn main:app --port 8000" --name financeiq-backend
pm2 save        # persist across reboots
pm2 startup     # generate systemd/launchd service
```
PM2 auto-restarts the process if it crashes, preserving the warm cache cycle.

### Option 3 — systemd (Linux server)
```ini
# /etc/systemd/system/financeiq.service
[Unit]
Description=FinanceIQ Backend
After=network.target

[Service]
WorkingDirectory=/path/to/global_dashboard/backend
ExecStart=/path/to/.venv/bin/uvicorn main:app --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```bash
systemctl enable financeiq && systemctl start financeiq
```

---

## Important Notes

- **Cache is in-memory only.** If the process restarts, all cache entries are cleared and the scheduler re-warms from scratch on startup (first run fires immediately via `next_run_time=datetime.now()`).
- **Not distributed.** The cache is local to the process. If you run multiple uvicorn workers (`--workers 4`), each worker has its own cache and its own scheduler. For multi-worker setups, replace the in-memory cache with Redis.
- **FinBERT warm-up** requires `transformers` and `torch` to be installed. Without them, the sentiment job still runs but returns neutral fallback scores (0.33/0.33/0.34). Install with: `.venv/bin/pip install transformers torch`.
