# Fundamental Analysis — Developer Reference

## Purpose
Computes valuation, growth, and financial quality metrics from yfinance `info` dict and financial statements. Provides a screener across a 50-stock universe.

## Files
```
backend/features/fundamental/
├── router.py     API endpoints
└── analyzer.py   get_overview(), get_valuation(), get_growth(), get_quality(), get_screener()
frontend/src/features/fundamental/
└── index.jsx     Tab router: valuation / growth / health / screener
```

## API Endpoints (`/api/v1/fundamental`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/overview/{ticker}` | Valuation + growth + quality in one call |
| `GET` | `/valuation/{ticker}` | PE, PB, PS, EV/EBITDA, Graham Number, DCF |
| `GET` | `/growth/{ticker}` | Revenue growth, earnings growth, margins, FCF, growth score |
| `GET` | `/quality/{ticker}` | ROE, ROA, ROIC, D/E, current ratio, Altman Z, Piotroski F, quality score |
| `GET` | `/screener` | Screener across 50-stock universe |

### Screener query params
- `min_pe`, `max_pe: float` — PE ratio bounds
- `min_roe: float` — minimum ROE as percentage (10 = 10%)
- `profitable_only: bool` — filter out companies with negative earnings
- `limit: int` — max results (default 30, max 50)

Results sorted by combined growth + quality score descending.

## Key Metrics

### Valuation
- **PE** — Price / trailing EPS
- **PB** — Price / Book value
- **PS** — Price / Revenue
- **EV/EBITDA** — Enterprise value / EBITDA
- **Graham Number** — `sqrt(22.5 × EPS × Book)` — Benjamin Graham's intrinsic value estimate
- **DCF** — Simple single-stage DCF: `FCF × (1 + growth) / (discount_rate - growth)`

### Growth Score (0–100)
Weighted composite of:
- Revenue growth YoY
- Revenue CAGR (3-year)
- Earnings growth
- Gross margin trend
- FCF yield

### Quality Score (0–100)
Weighted composite of:
- ROE (return on equity)
- ROA (return on assets)
- ROIC (return on invested capital)
- Debt/Equity ratio (inverted — lower is better)
- Current ratio (liquidity)
- Altman Z-score (bankruptcy risk)
- Piotroski F-score (9-point financial strength)

## Data Source
`yf.Ticker(ticker).info` — pulled fresh, not cached (yfinance handles its own caching).
Financial statements: `t.financials`, `t.balance_sheet`, `t.cashflow`.

## Caching
No explicit cache layer — relies on yfinance internal cache. Screener results may be slow on first call (~20–30 seconds for 50 tickers).
