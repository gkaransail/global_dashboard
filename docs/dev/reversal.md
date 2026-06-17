# Reversal Scanner — Developer Reference

## Purpose
Multi-factor reversal signal engine. Computes a directional bias (bullish/bearish/neutral) for a stock using technical, sentiment, breadth, and macro signals.

## Files
```
backend/features/reversal/
├── router.py         API endpoints
├── models.py         Pydantic models: ReversalSignal, SignalItem
├── signals/
│   ├── composite.py  analyze_ticker() — aggregates all signal categories
│   └── *.py          Individual signal modules (technical, sentiment, etc.)
frontend/src/features/reversal/
├── index.jsx         Tab router: analyze / sectors / watchlist / macro
└── *.jsx             Sub-views
```

## API Endpoints (`/api/v1/reversal`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/analyze/{ticker}` | Single ticker analysis |
| `POST` | `/analyze` | Same, POST body |
| `POST` | `/watchlist` | Analyze up to 20 tickers in batch, sorted by confidence |
| `GET` | `/signals/{ticker}` | Raw signals list, filterable by category |
| `GET` | `/sectors` | Sector ETF analysis (top 10 by confidence) |
| `GET` | `/quote/{ticker}` | Quick price quote |
| `GET` | `/macro` | Macro snapshot: Gold, DXY, VIX, Oil, 10Y yield, Copper, QQQ |

### Query parameters — `/analyze/{ticker}`
- `explain: bool` — include signal explanations (default false)
- `categories: str` — comma-separated filter: `technical`, `breadth`, `sentiment`
- `lookback_days: int` — history window 7–1825 (default 90)

## Core Logic — `analyze_ticker()`
Location: `features/reversal/signals/composite.py`

1. Fetches OHLCV via `core/data/fetcher.py::fetch_ohlcv()`
2. Runs each signal module against the data
3. Aggregates signals into `direction` (bull/bear/neutral) weighted by `strength`
4. Returns `confidence` 0.0–1.0, `strength` enum, and per-signal breakdown

## Response Shape (ReversalSignal)
```json
{
  "ticker": "AAPL",
  "direction": "bullish",
  "confidence": 0.74,
  "strength": "moderate",
  "signal_counts": {"bullish": 8, "bearish": 3, "neutral": 2},
  "signals": [
    {"name": "RSI Oversold", "category": "technical", "direction": "bullish", "strength": 0.8, "explanation": "..."}
  ]
}
```

## Caching
No explicit cache — relies on `core/data/fetcher.py` internal caching for OHLCV data.

## Sector ETFs tracked
`XLK, XLF, XLV, XLE, XLI, XLY, XLP, XLB, XLRE, XLU` (mapped in `core/data/fetcher.py::SECTOR_ETFS`).

## Macro Tickers
`GLD, DX-Y.NYB, ^VIX, CL=F, ^TNX, HG=F, QQQ` (mapped as `gold, dxy, vix, oil, tnx, copper, qqq`).

## Error Handling
All endpoints catch exceptions and raise `HTTPException(500)`. Watchlist endpoint silently skips failed tickers.
