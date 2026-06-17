# Global Dashboard — Developer & AI Agent Reference

## Architecture Overview

```
global_dashboard/
├── backend/                  FastAPI (Python 3.14, port 8000)
│   ├── main.py               App entry, router mounts, SPA catch-all
│   ├── core/
│   │   ├── config.py         API prefix = /api/v1
│   │   ├── cache.py          In-memory TTL cache (dict-backed)
│   │   ├── scheduler.py      APScheduler background jobs
│   │   ├── llm.py            LLM provider abstraction (Groq/Anthropic)
│   │   └── data/fetcher.py   yfinance wrapper, macro tickers, OHLCV
│   └── features/             One directory per feature
│       └── <feature>/
│           ├── router.py     FastAPI routes mounted at /api/v1/<feature>
│           ├── manifest.py   Feature metadata
│           └── *.py          Analyzers, scrapers, models
└── frontend/                 React 18 + Vite (port 5173)
    ├── vite.config.js        Proxies /api/* → localhost:8000
    └── src/
        ├── App.jsx           React Router — route per feature
        ├── core/
        │   ├── api.js        fetch wrapper, BASE=/api/v1
        │   └── store.js      Zustand: ticker, timeframe, watchlist
        └── features/         One directory per feature
```

## Request Flow

```
Browser → Vite dev server (:5173)
        → proxy /api/* → FastAPI (:8000)
        → router.py → analyzer/fetcher
        → yfinance / external API / SQLite
        → JSON response → React component
```

## Key Conventions

| Concern | Pattern |
|---|---|
| Cache | `_cache.get(key, ttl)` / `_cache.set(key, val)` — in-memory, no persistence |
| Error handling | Routers catch exceptions → `raise HTTPException(status_code=5xx)` |
| Data source | yfinance 1.4.1 — raises `YFRateLimitError` on rate limit (wrap in try/except) |
| API prefix | All routes live at `/api/v1/<feature>/...` |
| State | Zustand store: `ticker`, `timeframe`, `watchlist` — frontend-only except watchlist (synced to backtest DB) |
| Background jobs | APScheduler in `core/scheduler.py` — warms cache for top tickers |

## Feature → Route Map

| Feature | API prefix | Router file |
|---|---|---|
| Reversal Scanner | `/api/v1/reversal` | `features/reversal/router.py` |
| Technical Analysis | `/api/v1/technical` | `features/technical/router.py` |
| Fundamental Analysis | `/api/v1/fundamental` | `features/fundamental/router.py` |
| Options Analysis | `/api/v1/options` | `features/options/router.py` |
| Earnings Calendar | `/api/v1/earnings` | `features/earnings/router.py` |
| Fear & Greed | `/api/v1/sentiment` | `features/sentiment/router.py` |
| News Sentiment | `/api/v1/sentiment_ai` | `features/sentiment_ai/router.py` |
| Insider Tracker | `/api/v1/insider` | `features/insider/router.py` |
| Congress Tracker | `/api/v1/congress` | `features/congress/router.py` |
| 13F Holdings | `/api/v1/institutional` | `features/institutional/router.py` |
| Stock Rankings | `/api/v1/market_intel` | `features/market_intel/router.py` |
| Multi-Factor Screener | `/api/v1/screener` | `features/screener/router.py` |
| Backtest & RL | `/api/v1/backtest` | `features/backtest/router.py` |
| AI Research Agent | `/api/v1/ai_agent` | `features/ai_agent/router.py` |
| Portfolio Tracker | `/api/v1/portfolio` | `features/portfolio/router.py` |
| Alerts & Watchlist | `/api/v1/alerts` | `features/alerts/router.py` |

## Running Locally

```bash
# Backend
cd backend && source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm run dev -- --port 5173
```

## Database

SQLite at `backend/data/backtest.db`. Tables: `predictions`, `signal_weights`, `watchlist`.
Schema managed in `features/backtest/db.py::init_db()`. Migrations via `ALTER TABLE ... ADD COLUMN` wrapped in try/except.

## Scheduler Jobs

| Job | Interval | What it does |
|---|---|---|
| `screener_full_scan` | 25 min | Warms multi-factor screener cache |
| `smart_money_scan` | 50 min | Warms smart money / market intel cache |
| `technical_screener` | 4 min | Warms technical screener cache |
| `news_sentiment` | 12 min | Warms FinBERT news sentiment cache |
| `options_top_tickers` | 4 min | Runs options analysis on top 10 tickers (also logs predictions to backtest DB) |
