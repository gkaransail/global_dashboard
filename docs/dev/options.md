# Options Analysis — Developer Reference

## Purpose
Live options chain viewer with Black-Scholes Greeks, IV skew, unusual activity detection, ATM IV rank, max pain, GEX, and a Top 20 scanner.

## Files
```
backend/features/options/
├── router.py                 API endpoints
├── analyzers/
│   ├── chain.py              get_expirations(), get_chain() — yfinance option_chain
│   ├── unusual.py            get_unusual_activity() — volume/OI anomaly scoring
│   ├── skew.py               get_skew() — IV smile by strike and term structure
│   ├── analysis.py           get_analysis() — comprehensive overview + narrative
│   └── scanner.py            get_top_movers() — scans ~80 stocks, scores each
frontend/src/features/options/
├── index.jsx                 Tab router: overview / chain / unusual / skew / scanner
└── tabs/
    ├── Overview.jsx          Overview tab — analysis.py output
    ├── Chain.jsx             Chain tab — chain.py output
    ├── UnusualActivity.jsx   Unusual tab
    ├── Skew.jsx              IV Skew tab
    └── Scanner.jsx           Top 20 tab
```

## API Endpoints (`/api/v1/options`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/expirations/{ticker}` | Spot price + list of expirations with DTE |
| `GET` | `/chain/{ticker}` | Options chain for a specific expiration |
| `GET` | `/unusual/{ticker}` | Unusual activity scan (up to 6 expirations) |
| `GET` | `/skew/{ticker}` | IV skew + term structure |
| `GET` | `/top-movers` | Top 20 scanner result |
| `GET` | `/analysis/{ticker}` | Full overview: max pain, GEX, IV rank, narrative |

### Chain query params
- `expiration: str` — ISO date e.g. `2026-07-18`
- `strike_range: float` — fraction of spot for filter window (default 0.25 = ±25%)

### Analysis query params
- `timeframe: str` — passed to `log_prediction()` for backtest logging

## Key Algorithms

### Black-Scholes Greeks (`chain.py`)
Uses `math.erf` for normal CDF (no scipy). Computes delta, gamma, theta (per day), vega (per 1% IV). Returns `None` when T ≤ 1e-6 or sigma ≤ 1e-6.

### Unusual Activity Score (`unusual.py::_unusual_score`)
```
score = vol_oi_score × 0.40 + prem_score × 0.40 + iv_score × 0.20

vol_oi_score = min(vol/OI / 10, 1.0)         # caps at 10× OI
prem_score   = min(log10(premium) / 7, 1.0)  # log scale to $10M
iv_score     = min((iv - 0.5) / 1.5, 1.0)   # elevated if IV > 50%
```
Minimum threshold: score ≥ 0.25 OR vol/OI ≥ 0.5. Minimum 100 contracts volume.

### Max Pain (`analysis.py::calc_max_pain`)
Sums total call + put intrinsic value at every strike. Max pain = strike with minimum total loss to option sellers.

### GEX (`analysis.py::calc_gex`)
Gamma Exposure = Σ (gamma × OI × 100 × spot²) for calls − puts. Positive GEX = market maker long gamma (dampening moves). Negative GEX = short gamma (amplifying moves).

### IV Rank (`analysis.py::calc_iv_rank`)
Fetches 1-year of ATM IV history. `iv_rank = (current_iv - 52w_low) / (52w_high - 52w_low) × 100`.

## Caching
- Chain / expirations: 5 min TTL (`CACHE_TTL = 300`)
- Unusual / skew: 10 min TTL (`CACHE_TTL = 600`)
- Analysis / top-movers: 5 min TTL

## Rate Limit Handling
yfinance 1.4.1 raises `YFRateLimitError`. All `t.history()` calls are wrapped in try/except. Chain validation (`t.options` for expiration check) removed — goes directly to `t.option_chain(expiration)`.

## Prediction Logging
`get_analysis()` calls `features/backtest/collector.py::log_prediction()` after every fresh (non-cached) analysis. One prediction per ticker+timeframe per calendar day.

## Scanner Universe
~80 liquid stocks defined in `scanner.py::UNIVERSE`. Covers Mag7, semis, software, financials, healthcare, energy, consumer, ETFs. Uses `concurrent.futures.ThreadPoolExecutor` for parallel scoring.
