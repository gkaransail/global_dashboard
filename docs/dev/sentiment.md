# Fear & Greed — Developer Reference

## Purpose
Computes a composite Fear & Greed index from 6 market sub-indicators, similar to CNN's Fear & Greed index but built from raw data.

## Files
```
backend/features/sentiment/
├── router.py     Single endpoint: GET /dashboard
└── analyzer.py   get_sentiment() — computes composite index
frontend/src/features/sentiment/
└── index.jsx     Dashboard view
```

## API Endpoints (`/api/v1/sentiment`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/dashboard` | `refresh: bool` | Composite fear/greed index |

`refresh=true` invalidates the cache key `"sentiment:composite"` before computing.

## Composite Index Computation (`get_sentiment`)
Combines 6 sub-indicators, each scored 0–100:

| Sub-indicator | Proxy | Direction |
|---|---|---|
| **VIX** | `^VIX` — implied volatility | High VIX = fear (low score) |
| **Market Momentum** | S&P 500 vs 125-day MA | Above MA = greed |
| **Put/Call Ratio** | CBOE equity PCR | High PCR = fear |
| **Safe Haven Demand** | Stock vs bond returns | Bonds outperform = fear |
| **Junk Bond Spread** | HYG vs IEF yield spread | Wide spread = fear |
| **Market Breadth** | % stocks above 50-day MA | Low breadth = fear |

**Composite = equal-weighted average of 6 sub-scores.**

### Scale
- 0–24: Extreme Fear
- 25–44: Fear
- 45–55: Neutral
- 56–74: Greed
- 75–100: Extreme Greed

## Response Shape
```json
{
  "composite": 42,
  "label": "Fear",
  "sub_indicators": {
    "vix": {"score": 35, "label": "Fear", "value": 22.4, "description": "..."},
    "momentum": {"score": 60, ...},
    ...
  },
  "timestamp": "2026-06-17T22:00:00Z"
}
```

## Caching
Cache key: `"sentiment:composite"`, TTL: 900 seconds (15 min). `refresh=true` calls `_cache.invalidate()` before fetching.

## Data Sources
All via yfinance: `^VIX`, `^GSPC`, `^SPXEW`, `HYG`, `IEF`, individual stock queries for breadth.
