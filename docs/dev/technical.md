# Technical Analysis — Developer Reference

## Purpose
Computes standard technical indicators, detects chart patterns, derives support/resistance levels, and screens a stock universe for given conditions.

## Files
```
backend/features/technical/
├── router.py     API endpoints
└── analyzer.py   get_indicators(), get_patterns(), get_levels(), get_screener()
frontend/src/features/technical/
└── index.jsx     Tab router: indicators / patterns / levels / screener
```

## API Endpoints (`/api/v1/technical`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/indicators/{ticker}` | `period`, `lookback_days` | RSI, MACD, BBands, EMA20/50/200, ATR, Stochastic, VWAP |
| `GET` | `/patterns/{ticker}` | `period` | Detected chart patterns |
| `GET` | `/levels/{ticker}` | `period` | Support/resistance levels |
| `GET` | `/screener` | `conditions`, `limit` | Universe scan for conditions |

## Indicators Computed (`get_indicators`)
- **RSI** (14-period) — overbought > 70, oversold < 30
- **MACD** (12/26/9) — signal line, histogram, divergence
- **Bollinger Bands** (20-period, 2σ) — upper/mid/lower, %B, bandwidth
- **EMA 20 / 50 / 200** — trend structure
- **ATR** (14-period) — volatility in price units
- **Stochastic** (%K, %D, 14/3/3)
- **VWAP** — volume-weighted average price (intraday proxy from daily data)

Response includes `current` values plus `history` arrays (last 60 bars) for charting.

## Patterns Detected (`get_patterns`)
Algorithmic detection on OHLCV history. Each pattern returns:
```json
{
  "name": "Head and Shoulders",
  "direction": "bearish",
  "confidence": 0.78,
  "target": 142.50,
  "invalidation": 165.00,
  "bars_ago": 3
}
```

## Levels (`get_levels`)
Derives support/resistance from:
- Recent swing highs/lows
- High-volume price clusters
- Psychological round numbers
- 52-week high/low

## Screener (`get_screener`)
Universe: 50 popular tickers (hardcoded in `analyzer.py`).
Conditions are string names passed as comma-separated query param.
Results scored by how many conditions match, sorted descending.

## Data Source
`core/data/fetcher.py::fetch_ohlcv(ticker, period)` — wraps `yf.Ticker.history()`.
Period strings: `3mo`, `6mo`, `1y` (yfinance format).
