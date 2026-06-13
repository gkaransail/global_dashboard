# Smart Money Scanner Feature

## What it does

Scans ~75 large-cap and high-volume stocks and scores each one across three signal categories:
- **Options flow** — put/call ratio, unusual activity, IV skew
- **Insider transactions** — net buying vs selling in last 90 days
- **Institutional positioning** — accumulation/distribution trend

Returns two ranked lists:
- **Top 25 Bullish** — stocks with positive signal confluence
- **Top 25 Bearish** — stocks with negative signal confluence

Click any stock to open a full signal breakdown panel.

---

## Scoring System

```
Composite Score = Options (40%) + Insider (35%) + Institutional (25%)
Range: -1.0 (max bearish) to +1.0 (max bullish)
```

| Score | Verdict |
|---|---|
| ≥ +0.35 | Strong Buy |
| +0.15 to +0.35 | Bullish |
| −0.15 to +0.15 | Neutral |
| −0.35 to −0.15 | Bearish |
| ≤ −0.35 | Strong Sell |

---

## Signal Details

### Options Flow (40% weight)

| Signal | Bullish | Bearish |
|---|---|---|
| Put/Call Ratio | PCR < 0.5 → +1.0 | PCR > 1.4 → -1.0 |
| Unusual activity | Strikes with vol/OI > 3 in calls | Same in puts |
| IV Skew | OTM puts cheaper than calls | OTM puts significantly more expensive |

**PCR interpretation:**
- PCR < 0.7: Traders are buying significantly more calls than puts — bullish
- PCR > 1.2: Traders are buying significantly more puts — bearish or hedging
- The "unusual activity" count tells you how many strikes have volume spiking far above open interest — these are fresh directional bets, not routine hedges

**IV Skew:**
- Normally puts carry higher IV than calls (market always fears downside more)
- When skew flattens or reverses: market is unusually worried about upside (squeeze potential) or unusually calm about downside

### Insider Transactions (35% weight)

Looks at the last 90 days of SEC filings, filtered to:
- **Buy signal:** Transactions containing "Purchase" in the filing text
- **Sell signal:** Transactions containing "Sale" or "Sold"
- **Ignored:** Stock awards, grants, gifts, option exercises (these aren't discretionary)

Score is based on the net value (buy dollars − sell dollars) relative to total transaction value.

**Important nuance about insider selling:**
- Insider selling is common and often non-informative (tax planning, diversification, auto-sell programs)
- Insider *buying* is far more informative — executives rarely buy their own stock unless they believe it's undervalued
- A strong insider buy signal = multiple insiders across different roles all purchasing in the same quarter
- Don't over-weight a bearish insider score caused purely by routine sales

### Institutional Positioning (25% weight)

Uses two data points from 13F filings:
1. **% institutionally held** — baseline conviction metric (>70% = heavily backed)
2. **pctChange in top holder positions** — whether institutions are adding or trimming

Positive average pctChange = accumulation phase → bullish
Negative average pctChange = distribution phase → bearish

**Lag note:** 13F filings are quarterly with a 45-day delay, so institutional data is 1-3 months behind. Use it as a trend confirmation signal, not a real-time indicator.

---

## Architecture

### Backend — `backend/features/smart_money/`

```
smart_money/
├── manifest.py          Feature metadata
├── router.py            Two endpoints: /scan and /ticker/{ticker}
├── scanner.py           Concurrent scan of the stock universe
└── signals/
    ├── options.py       Options signal scorer
    ├── insider.py       Insider transaction scorer
    └── institution.py   Institutional positioning scorer
```

**Concurrency:** Uses `ThreadPoolExecutor(max_workers=12)` to scan ~75 stocks simultaneously. First scan takes ~25–35 seconds. Results are cached for 1 hour.

**Stock Universe (~75 stocks):**
Mega-cap tech, semiconductors, software, finance, healthcare, energy, consumer, industrial, and high-volume speculative names.

### Frontend — `frontend/src/features/smart_money/`

```
smart_money/
├── index.jsx             Feature root
└── SmartMoneyScanner.jsx Main component with:
                          - Two-column bullish/bearish grid
                          - Per-stock signal score bars
                          - Click → detail modal with full breakdown
                          - Filter by dominant signal type
                          - Refresh button (clears cache)
```

---

## API Endpoints

### `GET /api/v1/smart_money/scan`

**Params:**
- `tickers` — comma-separated custom list (default: full universe)
- `refresh=true` — force fresh scan, bypass cache

**Response:**
```json
{
  "scanned": 71,
  "universe_size": 75,
  "last_updated": "2026-06-04T22:00:00Z",
  "bullish": [
    {
      "ticker": "AAPL",
      "price": 312.50,
      "change_pct": 0.44,
      "composite_score": 0.38,
      "verdict": "Strong Buy",
      "signals": {
        "options":     { "score": 0.72, "pcr": 0.45, "unusual_calls": 8 },
        "insider":     { "score": 0.20, "buy_count": 2, "buy_value": 4200000 },
        "institution": { "score": 0.15, "inst_pct_held": 74.1, "avg_position_change": 3.2 }
      },
      "top_reasons": ["PCR 0.45 — heavy call buying", "2 insider purchases ($4.2M)"]
    }
  ],
  "bearish": [ ... ]
}
```

### `GET /api/v1/smart_money/ticker/{ticker}`
Full signal breakdown for a single stock (bypasses cache).

---

## How to use it for trading decisions

1. **Start with the filter** — if you want the highest-conviction signals, filter by "Strong insider activity". Insider buying + call buying together is the most reliable combination.

2. **Don't act on a single signal** — a stock might show bullish options flow simply because of near-term event speculation. Check all three signals agree.

3. **Cross-reference with Earnings Calendar** — a stock showing bullish options flow might just be pre-earnings positioning. Check if earnings are within 30 days.

4. **Use the bearish list as a hedging watchlist** — if you hold a stock that appears in the bearish list with a negative institutional trend + insider selling, consider reducing position size or buying puts.

5. **The strongest bullish signal combination:**
   - PCR < 0.6 (heavy call buying)
   - 2+ insider purchases in last 60 days
   - Positive institutional pctChange (institutions adding)

6. **The strongest bearish signal combination:**
   - PCR > 1.3 (heavy put buying)
   - Large insider sales (multiple officers selling simultaneously)
   - Negative institutional pctChange (institutions trimming)

---

## Running it

```bash
cd backend && uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

Navigate to **Smart Money Scanner** in the sidebar. First load takes ~30 seconds while the scan runs. Subsequent loads use the 1-hour cache.
