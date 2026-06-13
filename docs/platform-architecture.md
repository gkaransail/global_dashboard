# Platform Architecture

## Overview

FinanceIQ is a full-stack financial intelligence platform built as a FastAPI backend + React/Vite frontend. The backend fetches market data from yfinance, runs analysis pipelines, and serves JSON over a versioned REST API. The frontend is a single-page React app that consumes those APIs and renders a dark-theme dashboard.

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser / User                        │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP (HashRouter #/ routes)
┌───────────────────────▼──────────────────────────────────────┐
│              React + Vite Frontend (port 5173)               │
│                                                              │
│  App.jsx                                                     │
│  ├── LandingPage.jsx      (route: #/)                        │
│  └── DashboardShell                                          │
│       ├── Sidebar.jsx                                        │
│       ├── TickerBar.jsx   (global ticker + timeframe)        │
│       └── feature-workspace                                  │
│            ├── ReversalFeature  (#/reversal/*)               │
│            ├── OptionsFeature   (#/options/*)                │
│            └── ComingSoon       (#/<feature>/*)              │
└───────────────────────┬──────────────────────────────────────┘
                        │ /api/v1/* (proxied in dev, direct in prod)
┌───────────────────────▼──────────────────────────────────────┐
│               FastAPI Backend (port 8000)                    │
│                                                              │
│  main.py                                                     │
│  ├── core/                                                   │
│  │    ├── data/fetcher.py   (yfinance wrapper + TTL cache)   │
│  │    └── cache.py          (in-memory TTL store)            │
│  └── features/                                               │
│       ├── registry.py       (auto-discover feature routers)  │
│       ├── reversal/                                          │
│       │    ├── router.py                                     │
│       │    └── signals/     (4 analyzers)                    │
│       └── options/                                           │
│            ├── router.py                                     │
│            └── analyzers/   (analysis, chain, unusual, skew) │
└───────────────────────┬──────────────────────────────────────┘
                        │ yfinance (HTTP to Yahoo Finance)
┌───────────────────────▼──────────────────────────────────────┐
│                    Yahoo Finance (yfinance)                   │
│   OHLCV history · Options chains · Sector ETF prices         │
│   Macro tickers (VIX, DXY, Gold, Oil, 10Y yield, Copper)    │
└──────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
global_dashboard/
├── backend/
│   ├── main.py                        # FastAPI app factory + CORS
│   ├── requirements.txt
│   ├── core/
│   │   ├── cache.py                   # In-memory TTL cache
│   │   ├── config.py                  # Settings (env vars)
│   │   └── data/
│   │       └── fetcher.py             # yfinance wrappers for OHLCV + macro
│   └── features/
│       ├── registry.py                # Auto-discovers all feature routers
│       ├── reversal/
│       │   ├── manifest.py            # Feature metadata (name, version)
│       │   ├── models.py              # Pydantic models (ReversalSignal, etc.)
│       │   ├── router.py              # FastAPI routes
│       │   └── signals/
│       │       ├── base.py            # BaseSignalAnalyzer abstract class
│       │       ├── composite.py       # Aggregator + scoring engine
│       │       ├── technical.py       # RSI, MACD, Bollinger, MA, Volume
│       │       ├── macro.py           # VIX, Gold, DXY, Oil, Yields, Copper
│       │       ├── breadth.py         # Sector rotation, breadth thrust
│       │       └── sentiment.py       # Fear/Greed, Wyckoff, momentum
│       └── options/
│           ├── manifest.py
│           ├── router.py              # FastAPI routes
│           └── analyzers/
│               ├── analysis.py        # Expected move, max pain, key levels
│               ├── chain.py           # Full chain fetch + Greeks parsing
│               ├── unusual.py         # Unusual activity detector
│               └── skew.py            # IV skew + term structure
├── frontend/
│   ├── index.html                     # Google Fonts (Inter), SVG favicon
│   ├── vite.config.js                 # Dev proxy: /api → localhost:8000
│   ├── package.json
│   └── src/
│       ├── main.jsx                   # React root + HashRouter
│       ├── App.jsx                    # Route layout (Landing vs Dashboard)
│       ├── index.css                  # Design system (~900 lines of CSS vars)
│       ├── core/
│       │   ├── store.js               # Zustand store (ticker, timeframe, watchlist)
│       │   └── api.js                 # Typed fetch wrapper
│       ├── components/
│       │   ├── Sidebar.jsx            # Left nav with feature links
│       │   └── TickerBar.jsx          # Top bar: input + timeframe pills + price
│       └── features/
│           ├── index.js               # Feature registry (FEATURES array)
│           ├── LandingPage.jsx        # Marketing page at #/
│           ├── ComingSoon.jsx         # Placeholder for in-development features
│           ├── reversal/
│           │   ├── index.jsx          # Tab container (Analyze / Sectors / Watchlist / Macro)
│           │   ├── ReversalDashboard.jsx
│           │   ├── MacroView.jsx
│           │   ├── SectorGrid.jsx
│           │   └── Watchlist.jsx
│           └── options/
│               ├── index.jsx          # Tab container (Overview / Chain / Unusual / Skew)
│               ├── OptionsOverview.jsx
│               ├── OptionsChain.jsx   # Chain table + ChainGuide component
│               ├── UnusualActivity.jsx
│               ├── VolSkew.jsx
│               └── MarketSnapshot.jsx
└── docs/
    ├── platform-architecture.md      # This file
    ├── reversal-analysis.md
    ├── options-analysis.md
    └── coming-soon-features.md
```

---

## Backend

### FastAPI Application (`main.py`)

The app uses FastAPI's auto-documentation (`/docs` for Swagger UI, `/redoc` for ReDoc). CORS is configured to allow all origins in development.

Feature routers are auto-discovered by `features/registry.py` — it scans for any `router.py` in the `features/` subdirectories and mounts them at `/api/v1/<feature_id>/`.

```python
# Auto-discovery pattern in registry.py
for feature_dir in features_path.iterdir():
    router_path = feature_dir / "router.py"
    if router_path.exists():
        module = importlib.import_module(f"features.{feature_dir.name}.router")
        app.include_router(module.router, prefix=f"/api/v1/{feature_dir.name}")
```

This means **adding a new feature requires no changes to `main.py`** — just create a new directory with a `router.py`.

### Data Fetching (`core/data/fetcher.py`)

All market data comes from yfinance. Key functions:

| Function | Returns | Used By |
|----------|---------|---------|
| `fetch_ohlcv(ticker, period)` | DataFrame with Open/High/Low/Close/Volume | Reversal signals, Reversal quote |
| `fetch_macro_data(period)` | Dict of DataFrames keyed by macro ticker | Macro + Breadth + Sentiment signals |
| `fetch_sector_data(period)` | Dict of DataFrames keyed by sector ETF | Breadth signals |

**Macro tickers fetched**: `^VIX`, `DX-Y.NYB` (DXY), `GLD`, `CL=F` (Oil), `^TNX` (10Y yield), `HG=F` (Copper), `^GSPC` (S&P 500)

**Sector ETFs fetched**: `XLK`, `XLF`, `XLV`, `XLY`, `XLP`, `XLI`, `XLB`, `XLE`, `XLRE`, `XLU`, `XLC`

### Cache (`core/cache.py`)

Simple in-memory TTL cache. No Redis or external dependencies.

```python
cache.set(key, value)        # stores with timestamp
cache.get(key, ttl=180)      # returns None if older than TTL seconds
```

Default TTL: **180 seconds (3 minutes)** for all endpoints. This means live market data refreshes at most every 3 minutes. You can force a refresh by appending `?bust=1` or waiting for TTL expiry.

### API Endpoints

```
GET  /api/v1/reversal/analyze/{ticker}?explain=false&lookback_days=90
GET  /api/v1/reversal/quote/{ticker}
GET  /api/v1/reversal/sectors
GET  /api/v1/reversal/macro

GET  /api/v1/options/analysis/{ticker}?timeframe=3mo
GET  /api/v1/options/chain/{ticker}?timeframe=3mo
GET  /api/v1/options/unusual/{ticker}
GET  /api/v1/options/skew/{ticker}
```

All endpoints return JSON. Error responses use standard HTTP status codes with a `{"detail": "..."}` body.

---

## Frontend

### State Management (`core/store.js`)

Global state is managed with **Zustand** — a minimal React state library. The store holds:

```js
{
  ticker: string,           // e.g. "AAPL"
  timeframe: string,        // e.g. "3mo"
  watchlist: string[],      // e.g. ["AAPL", "TSLA", "SPY"]

  setTicker(v),
  setTimeframe(v),
  addToWatchlist(t),
  removeFromWatchlist(t),
}
```

`TIMEFRAMES` is also exported from `store.js` as a typed array so all components reference the same source of truth for timeframe keys, labels, and lookback windows.

Any component that calls `useStore()` re-renders automatically when the relevant state changes. The TickerBar updates `ticker` and `timeframe`, which triggers re-renders in ReversalDashboard, OptionsChain, etc.

### API Client (`core/api.js`)

Thin fetch wrapper that prepends the base URL and throws on non-2xx responses:

```js
const BASE = `${BACKEND}/api/v1`   // BACKEND = '' in dev (proxied), or VITE_BACKEND_URL in prod

export const api = {
  get: (path) => fetch(`${BASE}${path}`).then(r => r.json()),
  post: (path, body) => fetch(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
}
```

### Design System (`index.css`)

All visual constants are CSS custom properties defined at `:root`:

```css
/* Colors */
--bg: #07070e;          /* near-black background */
--surface: #0e0e1a;     /* card surfaces */
--accent: #6366f1;      /* indigo brand color */
--bull: #22d37a;        /* green for bullish */
--bear: #f05252;        /* red for bearish */
--neutral: #8b95a3;     /* gray for neutral */
--muted: #5a6270;       /* dimmed text */

/* Typography */
--font: 'Inter', sans-serif;

/* Shadows */
--shadow-sm: 0 1px 4px rgba(0,0,0,0.3);
--shadow-md: 0 4px 16px rgba(0,0,0,0.4);
--shadow-glow: 0 0 24px rgba(99,102,241,0.15);   /* indigo glow */

/* Gradients */
--gradient-accent: linear-gradient(135deg, #6366f1, #8b5cf6);
--gradient-bull: linear-gradient(135deg, #22d37a, #0ea472);
--gradient-bear: linear-gradient(135deg, #f05252, #c53030);
```

Components use semantic class names (`.card`, `.badge`, `.spinner`, etc.) rather than utility classes.

### Routing

Uses React HashRouter (`#/` prefix in URLs) for compatibility with static hosting (no server-side routing needed). Routes:

```
#/                     → LandingPage
#/reversal/analyze     → ReversalDashboard
#/reversal/sectors     → SectorGrid
#/reversal/watchlist   → Watchlist
#/reversal/macro       → MacroView
#/options/chain        → OptionsChain (with ChainGuide)
#/options/unusual      → UnusualActivity
#/options/skew         → VolSkew
#/<other>/*            → ComingSoon page
```

---

## Running Locally

### Prerequisites

- Python 3.11+ (tested on 3.14)
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard available at: `http://localhost:5173`

In dev mode, Vite proxies `/api/*` requests to `http://localhost:8000` automatically — no CORS issues.

### VS Code Workflow

Open two integrated terminals (Ctrl+` for the first, then the + button for a second):
- **Terminal 1**: Run the backend (`uvicorn main:app --reload --port 8000`)
- **Terminal 2**: Run the frontend (`npm run dev`)

Keep both running. Changes to backend code reload automatically (FastAPI `--reload`). Changes to frontend code hot-reload in the browser (Vite HMR).

---

## Deploying to Production

### Backend → Render

1. Create a new **Web Service** on Render
2. Set root directory to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variable: `PYTHON_VERSION=3.11.0`
6. Deploy — Render gives you a URL like `https://your-app.onrender.com`

### Frontend → Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. From the `frontend/` directory: `vercel`
3. Set environment variable in Vercel dashboard:
   ```
   VITE_BACKEND_URL=https://your-app.onrender.com
   ```
4. Redeploy. The frontend will call your Render backend directly (no proxy needed in production).

---

## Adding a New Feature

1. Create `backend/features/<feature_name>/`
2. Add `router.py` with a FastAPI `APIRouter` object named `router`
3. Add `manifest.py` with feature metadata
4. Add the feature to `frontend/src/features/index.js` (FEATURES array)
5. Create the React component(s) in `frontend/src/features/<feature_name>/`
6. Add the route in `App.jsx`

The backend auto-discovers the router. The frontend ComingSoon component handles any route not yet implemented.

---

## Future AI Integration

The codebase is prepared for Claude API integration via `// AI_HOOK:` comments in `OptionsOverview.jsx`. The contract:

```
POST /api/v1/ai/options-summary
Body: { ticker: string, snapshot: <options analysis data> }
Returns: { headline: string, bullets: string[], sentiment: "bullish"|"bearish"|"neutral" }
```

When implemented, replace the `AISummaryStub` component body with a real fetch to this endpoint. The stub currently generates a preview from existing data to show the intended UX.
