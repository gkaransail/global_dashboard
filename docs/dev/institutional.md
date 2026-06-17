# 13F Holdings (Institutional) — Developer Reference

## Purpose
Fetches institutional ownership data from 13F filings via yfinance. Shows top holders, position changes (accumulation/distribution), and screens the universe by ownership level and flow.

## Files
```
backend/features/institutional/
├── router.py     API endpoints
└── analyzer.py   get_holders(), run_screener()
frontend/src/features/institutional/
└── index.jsx     Tab router: holders / flow / screener
```

## API Endpoints (`/api/v1/institutional`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/holders/{ticker}` | Top institutional holders + position changes |
| `GET` | `/flow/{ticker}` | Net institutional flow summary + ownership % |
| `GET` | `/screener` | Screen universe by min_inst_pct and flow direction |

### Screener params
- `min_inst_pct: float` — minimum % institutionally held (default 50.0)
- `flow: str` — `all | accumulating | distributing`

## Data Source (`analyzer.py`)
Uses yfinance:
- `yf.Ticker(ticker).institutional_holders` — DataFrame of top holders with shares and % change
- `yf.Ticker(ticker).info["institutionPercent"]` — total institutional ownership %
- Position change: `% change from previous filing`

## `get_holders()` Response
```json
{
  "ticker": "AAPL",
  "ownership": {
    "inst_pct": 0.62,
    "inst_pct_display": "62.0%"
  },
  "flow": {
    "net_flow": "accumulating",
    "buyers": 8,
    "sellers": 3,
    "unchanged": 2
  },
  "holders": [
    {
      "name": "Vanguard Group",
      "shares": 1200000000,
      "pct_out": 0.078,
      "change_pct": 0.02,
      "flow": "accumulating"
    }
  ]
}
```

## Flow Classification
For each holder:
- `change_pct > 0.01` → "accumulating"
- `change_pct < -0.01` → "distributing"
- Otherwise → "unchanged"

Net flow = "accumulating" if buyers > sellers, "distributing" if sellers > buyers.

## Screener (`run_screener`)
Universe: ~50 tickers (hardcoded in `analyzer.py`). For each ticker:
1. Fetch `inst_pct` and `flow`
2. Apply `min_inst_pct` filter
3. Apply `flow` filter
4. Return sorted by `inst_pct` descending

## 13F Filing Frequency
Filed quarterly (45 days after quarter end). yfinance returns the most recent filed data. Position changes are vs the prior quarter's filing.

## Caching
No explicit cache — relies on yfinance internal caching (~15 min for `info`).
