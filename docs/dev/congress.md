# Congress Tracker — Developer Reference

## Purpose
Fetches STOCK Act disclosures from Congress members, provides a filterable trade feed, member rankings, hot ticker aggregation, and summary stats.

## Files
```
backend/features/congress/
├── router.py   API endpoints + filtering logic
└── fetcher.py  fetch_all_trades() — scrapes disclosure source
frontend/src/features/congress/
└── index.jsx   Tab router: feed / members / tickers
```

## API Endpoints (`/api/v1/congress`)

| Method | Path | Key params | Description |
|---|---|---|---|
| `GET` | `/feed` | `days`, `ticker`, `chamber`, `transaction_type`, `limit` | Paginated trade feed |
| `GET` | `/members` | `days`, `limit` | Top traders ranked by activity |
| `GET` | `/tickers` | `days`, `limit` | Hottest tickers with buy/sell breakdown |
| `GET` | `/summary` | `days` | Overall statistics |

### Common params
- `days: int` — look-back window 1–365 (default 90)
- `chamber: str` — `house | senate | all`
- `transaction_type: str` — `Purchase | Sale | all`

## Data Fetching (`fetcher.py`)
`fetch_all_trades()` is async. Source: HouseStockWatcher API or QuiverQuant or similar public STOCK Act data provider.

Each trade:
```json
{
  "member": "Nancy Pelosi",
  "chamber": "house",
  "party": "Democrat",
  "state": "CA",
  "ticker": "NVDA",
  "transaction_type": "Purchase",
  "transaction_date": "2026-03-15",
  "amount_min": 15001,
  "amount_max": 50000,
  "current_price": 134.50
}
```

## Filtering (`_filter_trades`)
Applied in-memory after fetching all trades (trades are cached at the fetcher level):
1. Date cutoff: `transaction_date >= today - days`
2. Ticker match (case-insensitive)
3. Chamber match
4. Transaction type match

## Ticker Sentiment Logic (`/tickers`)
```python
if purchase_count > sale_count * 1.5:
    sentiment = "bullish"
elif sale_count > purchase_count * 1.5:
    sentiment = "bearish"
else:
    sentiment = "mixed"
```

## Price Enrichment
Feed endpoint calls `_batch_current_prices()` for all tickers in the page. Uses `yf.Ticker(t).fast_info.last_price`. Results cached 5 minutes: `"congress:prices:{tickers}"`.

## Caching
All endpoints: TTL 3600s (1 hour). Cache key pattern: `congress:{endpoint}:{params}`.

## Response — `/members`
```json
{
  "members": [{
    "member": "Nancy Pelosi",
    "chamber": "house",
    "party": "Democrat",
    "state": "CA",
    "total_trades": 12,
    "purchase_count": 8,
    "sale_count": 4,
    "total_value_min": 180000,
    "tickers_traded": ["NVDA", "AAPL", "MSFT"]
  }]
}
```
