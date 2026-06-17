# Stock Rankings (Market Intel) — Developer Reference

## Purpose
Multi-factor stock ranking engine that combines options flow, smart money signals, insider activity, and market data into ranked bull/bear pick lists. Also provides a market-wide macro overview.

## Files
```
backend/features/market_intel/
├── router.py   GET /scan, GET /overview
└── scanner.py  run_scan(), get_market_overview()
frontend/src/features/market_intel/
└── index.jsx   Tab router: scan / smart_money / market
```

## API Endpoints (`/api/v1/market_intel`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/scan` | `horizon`, `limit` | Ranked bull/bear picks |
| `GET` | `/overview` | — | Macro market overview |

### `/scan` params
- `horizon: str` — `1w | 1m | 3m` (default `1m`)
- `limit: int` — results per side, 1–25 (default 15)
- Returns both `bullish` and `bearish` lists

## Scanner Logic (`scanner.py::run_scan`)
Universe: ~50 stocks (mix of Mag7, sector leaders, ETFs).

For each ticker:
1. Fetch options analysis via `features/options/analyzers/analysis.py::get_analysis()`
2. Fetch reversal signal via `features/reversal/signals/composite.py::analyze_ticker()`
3. Fetch insider summary via `features/insider/fetcher.py::fetch_summary()`
4. Compute composite score:
   ```
   options_score  = f(pc_ratio, iv_rank, gex, squeeze)
   reversal_score = f(confidence, direction)
   insider_score  = f(net_shares, sentiment)
   composite      = weighted_average(options, reversal, insider)
   ```
5. Assign direction (bull if composite > 0, bear if < 0)
6. Sort by |composite| descending for each direction

Response per stock:
```json
{
  "ticker": "NVDA",
  "direction": "bullish",
  "score": 7.4,
  "signals": ["low_pc_ratio", "reversal_bullish", "insider_buying"],
  "spot_price": 134.50,
  "change_1d_pct": 1.2
}
```

## Market Overview (`get_market_overview`)
Returns:
- S&P 500, Nasdaq, Russell 2000, VIX — current level + 5d/20d change
- Sector ETF returns (XLK, XLF, XLV, XLE, etc.)
- Breadth indicator: % stocks above 50-day MA
- Market regime: bull/bear/sideways classification

## Smart Money Sub-tab
Combination of:
- Institutional flow (accumulating stocks)
- Insider cluster buys
- Congressional purchases
- Options unusual activity (large premium)

Filtered to show stocks with ≥2 of these signals aligned.

## Caching
- Scan: TTL 1500s (25 min) — triggered by scheduler every 25 min
- Overview: TTL 300s (5 min)

## Scheduler Integration
`core/scheduler.py::_warm_smart_money_scan()` runs `run_scan()` every 50 min to keep cache warm. First API call may take 45–60s; subsequent calls return from cache in <100ms.
