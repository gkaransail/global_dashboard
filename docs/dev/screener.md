# Multi-Factor Screener — Developer Reference

## Purpose
Scores a universe of ~50 stocks across 4 independent factor dimensions (technical, smart_money, fundamental, sentiment) and returns a composite score for filtering and ranking.

## Files
```
backend/features/screener/
├── router.py   API endpoints
└── engine.py   run_scan(), score_ticker()
frontend/src/features/screener/
└── index.jsx   Tab router: screen / score / scheduler
```

## API Endpoints (`/api/v1/screener`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/screen` | `sort_by`, `direction`, `min_score`, `limit` | Scan universe with filters |
| `POST` | `/screen/custom` | body: `{tickers: []}` | Scan custom ticker list (max 20) |
| `GET` | `/score/{ticker}` | — | Full score breakdown for one ticker |

### `/screen` params
- `sort_by: str` — `composite_score | technical | smart_money | fundamental | sentiment`
- `direction: str` — `all | bull | bear` (bull = composite > 50, bear = composite < 50)
- `min_score: int` — 0–100 (filters by the primary sort dimension's score)
- `limit: int` — 1–100 (default 50)

## Factor Computation (`engine.py::score_ticker`)

Each factor returns a score 0–100:

### Technical Score
- RSI position (oversold = bullish, overbought = bearish)
- Price vs EMA20/50/200 alignment
- MACD histogram direction
- Bollinger Band position (%B)

### Smart Money Score
- Options unusual activity score from `unusual.py`
- Insider net sentiment from `insider/fetcher.py`
- Reversal confidence × direction from `reversal/signals/composite.py`

### Fundamental Score
- PE percentile within universe
- Growth score (from `fundamental/analyzer.py`)
- Quality/Piotroski score

### Sentiment Score
- FinBERT aggregate compound score from recent news
- Fear & Greed sub-index for the specific sector
- Put/call ratio direction

### Composite Score
```python
composite = (technical * 0.35 + smart_money * 0.30 +
             fundamental * 0.20 + sentiment * 0.15)
```

## Response Shape
```json
{
  "ticker": "NVDA",
  "composite_score": 73,
  "scores": {
    "technical": 81,
    "smart_money": 78,
    "fundamental": 55,
    "sentiment": 62
  },
  "direction": "bullish",
  "spot_price": 134.50,
  "signals": ["above_ema200", "unusual_call_activity", "low_pe"]
}
```

## Caching
Cache key: `screener:full_scan`, TTL 1800s (30 min). Scheduler warms every 25 min.
First cold call takes ~45s for 50 tickers (parallel with ThreadPoolExecutor).

## Custom Scan
`POST /screen/custom` with body `{"tickers": ["AAPL","MSFT"]}` — runs same `score_ticker()` on the provided list. Not cached. Max 20 tickers.

## Scheduler Integration
`core/scheduler.py::_run_technical_screener()` warms the cache every 4 min (technical only).
`_run_screener_full_scan()` warms the full composite every 25 min.
