# Earnings Calendar Feature

## What it does

Two views:

**Calendar** — Scans a watchlist of tickers (or your custom list) for upcoming earnings within the next N days. Each row shows:
- Earnings date and days until it (DTE)
- Expected move % from the options chain
- Average historical move on past earnings days
- EPS beat rate over last 8 quarters
- Whether options are over/under pricing this earnings vs history

**Analysis** — Deep dive on a single ticker: expected move, last 8 quarters of EPS surprises + actual stock reactions, and a pricing signal.

---

## Architecture

### Backend — `backend/features/earnings/`

| File | Purpose |
|---|---|
| `manifest.py` | Feature metadata, auto-discovered by `registry.py` |
| `router.py` | Two FastAPI endpoints |
| `analyzer.py` | All data logic: yfinance calls, expected move, EPS history |

**Auto-discovery:** Drop `manifest.py` + `router.py` in a folder under `features/` and it mounts automatically. No registration needed.

### Frontend — `frontend/src/features/earnings/`

| File | Purpose |
|---|---|
| `index.jsx` | Tab shell, passes selected ticker from Calendar → Analysis |
| `EarningsCalendar.jsx` | Calendar grid with ticker filter and days-ahead selector |
| `EarningsAnalysis.jsx` | Single ticker deep dive with history table |

---

## API Endpoints

### `GET /api/v1/earnings/calendar`
Upcoming earnings for a list of tickers.

**Query params:**
- `tickers` — comma-separated (default: 15-stock watchlist)
- `days_ahead` — 1–90 (default: 30)

**Response per ticker:**
```json
{
  "ticker": "NVDA",
  "earnings_date": "2026-08-26",
  "dte": 83,
  "spot": 218.66,
  "expected_move_pct": 21.0,
  "expected_move_dollar": 45.86,
  "atm_iv": 44.0,
  "avg_historical_move_pct": 1.6,
  "beat_rate_pct": 88,
  "quarters_sampled": 8
}
```

### `GET /api/v1/earnings/analysis/{ticker}`
Full analysis for one ticker.

**Response:**
```json
{
  "ticker": "AAPL",
  "spot": 312.50,
  "next_earnings_date": "2026-07-30",
  "dte": 56,
  "expected_move": { "pct": 10.1, "dollar": 31.46, "atm_iv": 25.8 },
  "pricing_signal": "overpriced",
  "summary": {
    "avg_historical_move_pct": 0.9,
    "max_historical_move_pct": 1.8,
    "beat_rate_pct": 100,
    "quarters_sampled": 8
  },
  "history": [
    {
      "date": "2026-04-30",
      "eps_estimate": 1.94,
      "eps_actual": 2.01,
      "surprise_pct": 3.5,
      "beat": true,
      "price_move_pct": 0.44
    }
  ]
}
```

---

## How to read it — trading decisions

### Expected Move vs Historical Move

```
Expected Move  = spot × ATM_IV × √(DTE/365)
```
This is what the options market is pricing in as the ±move by expiry.

Compare it to the **avg historical move** (how much the stock actually moved on past earnings days).

| Ratio (ExpMove / AvgHistMove) | What it means | Trade idea |
|---|---|---|
| > 1.5x | Options are expensive | Sell a straddle/strangle, or buy stock instead of calls |
| 0.8x – 1.5x | Fairly priced | No edge either way |
| < 0.8x | Options are cheap | Buy a straddle — the market is under-pricing the move |

### Pricing Signal
- **Overpriced** — options pricing in 1.2× or more than history suggests. Selling premium has a statistical edge.
- **Underpriced** — options pricing in less than 0.8× history. Buying a straddle may offer value.
- **Fairly priced** — no edge from IV alone.

### Beat Rate
- ≥ 75% beat rate = company consistently beats estimates. Market may already price this in.
- Low beat rate + high expected move = double risk (could miss AND have IV crush).

---

## How to use it step by step

1. Open the **Calendar** tab, set your timeframe (e.g. next 60 days)
2. Scan for tickers where the multiplier (ExpMove / HistMove) is extreme — either very high or very low
3. Click any row to jump to the **Analysis** tab for that ticker
4. In Analysis, read the full EPS history — look for consistency (does the stock always move the same direction? does it always beat?)
5. Cross-reference with the **Options Analysis → IV Skew** tab to see if put skew is elevated (market pricing in downside)
6. Choose your trade structure based on the signal (see table above)

---

## Running it

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) and click **Earnings Calendar** in the sidebar.
