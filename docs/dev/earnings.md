# Earnings Calendar — Developer Reference

## Purpose
Fetches upcoming earnings dates, computes implied expected moves from options, and provides 8-quarter EPS surprise history + historical earnings price reactions.

## Files
```
backend/features/earnings/
├── router.py     API endpoints
└── analyzer.py   get_calendar(), get_analysis(), DEFAULT_TICKERS
frontend/src/features/earnings/
└── index.jsx     Tab router: calendar / analysis
```

## API Endpoints (`/api/v1/earnings`)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/calendar` | `tickers`, `days_ahead` | Upcoming earnings for a list of tickers |
| `GET` | `/analysis/{ticker}` | — | Full earnings analysis: expected move, history |

### `/calendar` params
- `tickers: str` — comma-separated (default: `DEFAULT_TICKERS` ~40 tickers)
- `days_ahead: int` — look-ahead window 1–90 days (default 30)
- Max 30 tickers per request

## Default Tickers (`DEFAULT_TICKERS`)
~40 large-cap tickers covering Mag7, major financials, healthcare, energy. Defined in `analyzer.py`.

## Calendar Data (`get_calendar`)
For each ticker with upcoming earnings:
1. Fetch earnings date: `yf.Ticker(t).calendar` or `t.earnings_dates`
2. Fetch ATM options for nearest expiration after earnings date
3. Compute expected move: `(call_price + put_price) / spot` (straddle approximation)
4. Return sorted by date ascending

Response per ticker:
```json
{
  "ticker": "AAPL",
  "earnings_date": "2026-07-31",
  "days_until": 44,
  "time_of_day": "AMC",
  "expected_move_pct": 4.2,
  "avg_historical_move_pct": 3.8,
  "options_expensive": true
}
```

`options_expensive` = `expected_move_pct > avg_historical_move_pct * 1.2` (options pricing in 20%+ premium over historical).

## Full Analysis (`get_analysis`)
Returns:
- Last 8 quarters of EPS: estimate vs actual, surprise %, price reaction day-of
- Computed expected move for nearest earnings expiration
- `beat_rate` — % of last 8 quarters with positive EPS surprise
- `avg_move_on_beat` vs `avg_move_on_miss` — price behavior by outcome type
- `historical_avg_move_pct` — average absolute price move post-earnings

## Expected Move Calculation
```python
spot = t.fast_info.last_price
atm_call = min(chain.calls, key=lambda r: abs(r["strike"] - spot))
atm_put  = min(chain.puts,  key=lambda r: abs(r["strike"] - spot))
expected_move_pct = (atm_call["lastPrice"] + atm_put["lastPrice"]) / spot * 100
```

## EPS Surprise History
From `yf.Ticker.earnings_history` — returns quarterly EPS estimate, actual, and surprise. Historical price reactions fetched via daily OHLCV around earnings dates.

## Caching
Analysis: TTL 3600s. Calendar: TTL 1800s (30 min).
