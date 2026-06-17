# Insider Tracker — Developer Reference

## Purpose
Fetches SEC Form 4 insider transaction data, computes aggregate sentiment, and scans the universe for cluster insider buying signals.

## Files
```
backend/features/insider/
├── router.py     API endpoints
├── fetcher.py    fetch_transactions(), fetch_summary() — SEC EDGAR scraper
└── cluster.py    run_cluster_scan() — rolling window cluster detection
frontend/src/features/insider/
└── index.jsx     Tab router: feed / cluster
```

## API Endpoints (`/api/v1/insider`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/feed/{ticker}` | `days: int` | Recent Form 4 transactions + live price for P&L |
| `GET` | `/summary/{ticker}` | `days: int` | Aggregate sentiment: net shares, value, insider count |
| `GET` | `/cluster` | `min_insiders`, `days`, `window_days` | Universe scan for cluster buying |

### `/cluster` params
- `min_insiders: int` — minimum distinct insiders buying (default 2, max 10)
- `days: int` — total look-back window (default 60, max 365)
- `window_days: int` — rolling window for cluster detection (default 30, max 90)
- Returns top 20 clusters ranked by cluster score

## Data Source (`fetcher.py`)
Fetches from SEC EDGAR full-text search or OpenInsider.com (depending on implementation). Each transaction:
```json
{
  "date": "2026-06-10",
  "insider_name": "John Smith",
  "title": "CEO",
  "transaction_type": "Purchase",
  "shares": 10000,
  "price": 42.50,
  "value": 425000,
  "current_price": 45.00,
  "pnl_pct": 5.88
}
```

## Cluster Detection (`cluster.py`)
Algorithm:
1. Pull all transactions for each ticker in the universe over `days` period
2. Slide a `window_days` rolling window
3. Count distinct insider names who made purchases within each window
4. Flag windows where `count >= min_insiders`
5. Score = `insiders_count × log(total_value + 1)` (approx)

## Caching
- Feed: TTL 6 hours (`FEED_CACHE_TTL = 21600`) — Form 4 data changes infrequently
- Summary: TTL 6 hours
- Cluster: TTL 2 hours (hardcoded in `cluster.py`)

## Response — Summary
```json
{
  "ticker": "AAPL",
  "days": 180,
  "net_shares": 45000,
  "total_value": 1920000,
  "insider_count": 3,
  "purchase_count": 5,
  "sale_count": 1,
  "sentiment": "bullish"
}
```

`sentiment` is derived from purchase_count vs sale_count ratio.

## P&L Enrichment
After fetching transactions, the feed endpoint calls `yf.Ticker(sym).fast_info.last_price` to get current price and compute unrealized P&L for each transaction.
