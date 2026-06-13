# Global Financial Intelligence Dashboard

A full-stack financial analysis dashboard with reversal signal detection, options chain analysis, and macro market data. Built with FastAPI (Python) backend and React/Vite frontend.

---

## Prerequisites

- Python 3.9+
- Node.js 18+
- npm

---

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

### 2. Frontend

```bash
cd frontend
npm install
```

---

## Running the Dashboard

You need two terminals — one for the backend and one for the frontend.

### Terminal 1 — Start the API server

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.

### Terminal 2 — Start the frontend dev server

```bash
cd frontend
npm run dev
```

The dashboard will be available at **`http://localhost:5173`**.

> The Vite dev server proxies all `/api` requests to the FastAPI backend on port 8000, so you only need to open `localhost:5173` in your browser.

---

## Verify It's Working

Check the backend health endpoint:

```bash
curl http://localhost:8000/api/v1/health
```

Expected response:
```json
{"status": "ok", "version": "1.0.0"}
```

---

## Production Build (optional)

To serve the frontend as static files from the FastAPI server:

```bash
# Build the frontend
cd frontend
npm run build

# Run the backend (it serves the built frontend automatically)
cd ../backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` directly — no separate frontend server needed.

For multi-worker production deployments, add `--workers 4` (requires Redis; see `ARCHITECTURE.md` for caveats).

---

## Project Structure

```
global_dashboard/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── requirements.txt
│   ├── core/
│   │   ├── config.py        # Settings (cache TTLs, signal thresholds)
│   │   └── data/fetcher.py  # Shared yfinance data layer
│   └── features/
│       ├── registry.py      # Auto-discovers feature modules
│       ├── reversal/        # Reversal signal analysis (technical, macro, breadth, sentiment)
│       └── options/         # Options chain, Greeks, unusual activity, vol skew
└── frontend/
    ├── vite.config.js       # Dev proxy: /api → :8000
    └── src/
        ├── App.jsx
        ├── core/            # API wrapper + Zustand store
        └── features/        # Reversal and options UI components
```

See `ARCHITECTURE.md` for full API endpoint reference, signal weights, cache TTLs, and scaling notes.

---

## Key API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/v1/health` | Health check |
| `GET /api/v1/reversal/analyze/{ticker}` | Reversal signal for a ticker |
| `POST /api/v1/reversal/watchlist` | Bulk scan a list of tickers |
| `GET /api/v1/reversal/sectors` | Sector rotation analysis |
| `GET /api/v1/reversal/macro` | Macro snapshot (gold, VIX, DXY, oil, yields) |
| `GET /api/v1/options/chain/{ticker}` | Options chain with Black-Scholes Greeks |
| `GET /api/v1/options/unusual/{ticker}` | Unusual options activity |
| `GET /api/v1/options/skew/{ticker}` | Volatility skew and term structure |

---

## Adding a New Feature

1. Create `backend/features/myfeature/manifest.py` with a `MANIFEST` dict
2. Create `backend/features/myfeature/router.py` with a FastAPI `router`
3. The feature auto-discovers on next server restart — no changes to `main.py` needed

---

## Troubleshooting

**Backend fails to start** — ensure all packages are installed: `pip install -r requirements.txt`

**`Failed to load feature 'health'`** — this is a known non-critical warning; the dashboard still works.

**Yahoo Finance rate limits (429 errors)** — the app depends on Yahoo Finance's public API. Under heavy use you may see timeouts or stale data. Retry after a short wait or reduce request frequency.

**Port already in use** — kill the existing process: `lsof -ti :8000 | xargs kill` or `lsof -ti :5173 | xargs kill`
