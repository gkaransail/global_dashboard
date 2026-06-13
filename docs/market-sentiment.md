# Market Sentiment Feature

## What it does

Calculates a composite Fear & Greed Index (0–100) for the US equity market, using 7 independent indicators sourced from public market data.

Returns a single number, a verdict label, and a full per-indicator breakdown.

---

## Fear & Greed Scale

| Range | Verdict |
|---|---|
| 75–100 | Extreme Greed |
| 55–74 | Greed |
| 45–54 | Neutral |
| 25–44 | Fear |
| 0–24 | Extreme Fear |

---

## The 7 Indicators

| # | Indicator | Weight | Data Source |
|---|---|---|---|
| 1 | Market Volatility (VIX) | 20% | `^VIX` vs 50-day MA |
| 2 | Market Momentum | 15% | SPY 125-day price return |
| 3 | Put/Call Ratio | 20% | SPY options (3 nearest expirations) |
| 4 | Safe Haven Demand | 15% | TLT vs SPY 20-day relative return |
| 5 | Junk Bond Demand | 10% | HYG vs LQD 20-day relative return |
| 6 | Market Breadth | 10% | % of sector ETFs above 200MA |
| 7 | Price Strength | 10% | % of sectors within 5% of 52w high |

### 1. Market Volatility (VIX vs 50MA)
- VIX below its 50-day MA → market calming → greed signal
- VIX above its 50-day MA → volatility rising → fear signal
- Hard cap: VIX > 30 always biases toward fear regardless of MA relationship
- VIX < 15 adds a small greed boost

### 2. Market Momentum (SPY 125-day)
- Strong upward price trend = risk appetite = greed
- 125 days ≈ 6 months, smooths out short-term noise
- +20% over 125 days → max greed; −20% → max fear

### 3. Put/Call Ratio (SPY options)
- PCR < 0.9: traders buying calls (bullish bets) → greed
- PCR > 1.1: traders buying puts (hedging/bearish) → fear
- Aggregated across 3 nearest expirations for broader signal

### 4. Safe Haven Demand (TLT vs SPY)
- When stocks outperform bonds over 20 days: risk-on → greed
- When bonds outperform stocks: flight to safety → fear
- Uses 20-day window to capture current positioning

### 5. Junk Bond Demand (HYG vs LQD)
- HYG = high-yield (junk) bonds, LQD = investment-grade bonds
- HYG outperforming LQD = risk appetite is high → greed
- HYG underperforming = credit stress / risk-off → fear

### 6. Market Breadth (Sector ETFs above 200MA)
- 11 sector ETFs: XLK, XLF, XLV, XLE, XLI, XLY, XLP, XLB, XLRE, XLU, XLC
- % trading above their 200-day moving average
- >75% above = greed, <25% above = fear

### 7. Price Strength (Sectors near 52-week high)
- % of sectors within 5% of their 52-week high
- Markets at broad all-time or yearly highs → greed
- Most sectors far from highs → fear/correction territory

---

## How the composite is calculated

```
Each indicator score: -1.0 (fear) to +1.0 (greed)
Composite = Σ(indicator_score × weight)
Fear & Greed Index = round((composite + 1.0) / 2.0 × 100)
```

The raw score (-1 to +1) maps linearly to 0–100, centered at 50 = neutral.

---

## Architecture

### Backend — `backend/features/sentiment/`

```
sentiment/
├── manifest.py     Feature metadata
├── router.py       Single endpoint: /dashboard
└── analyzer.py     All 7 indicator functions + composite
```

**Cache TTL:** 15 minutes. Sentiment moves intraday so shorter cache than Smart Money (which is 1 hour).

### Frontend — `frontend/src/features/sentiment/`

```
sentiment/
├── index.jsx              Feature root with routing
└── SentimentDashboard.jsx
    - Animated gauge dial (canvas)
    - Per-indicator score bars
    - Sector ETF mini-chips (breadth + price strength)
    - Refresh button (clears cache)
```

---

## API

### `GET /api/v1/sentiment/dashboard`

**Params:**
- `refresh=true` — force fresh calculation, bypass 15-min cache

**Response:**
```json
{
  "fg_index": 61,
  "verdict": "Greed",
  "composite_score": 0.2107,
  "prev_index": 61,
  "change": 0,
  "last_updated": "2026-06-05T03:16:18Z",
  "indicators": {
    "vix": {
      "score": 0.583,
      "value": 15.4,
      "ma50": 19.11,
      "detail": "VIX 15.4 vs 50MA 19.1 (low/falling)",
      "weight": 0.2,
      "label": "Market Volatility",
      "fg_score": 79
    },
    "pcr": {
      "score": -0.381,
      "pcr": 1.152,
      "detail": "PCR 1.15 — put-heavy (fear)",
      "weight": 0.2,
      "label": "Put/Call Ratio",
      "fg_score": 31
    }
    // ...5 more indicators
  }
}
```

---

## How to interpret the reading

**High conviction signals (act with more confidence):**
- Extreme readings (0–15 or 85–100): rare and mean-reversionary — historically good contrarian entry points
- Multiple indicators aligned in same direction
- When PCR and VIX both in greed territory simultaneously: strong risk-on

**Divergence signals (caution):**
- VIX in greed but PCR in fear: traders hedging despite low volatility — watch for reversal
- Breadth in greed but price strength in fear: broad market up but sectors losing highs — distribution phase
- Junk bonds diverging from equities: credit market often leads equity correction

**Trading use cases:**
1. **Extreme Fear (<20):** Historically one of the best times to add equity exposure
2. **Extreme Greed (>80):** Consider reducing risk, buying puts as hedges
3. **Neutral (40–60):** Let other signals (reversal scanner, smart money) drive decisions
4. **Fear + insider buying:** High conviction long setup — fear is priced in but insiders disagree
5. **Greed + bearish smart money:** Consider reducing position sizes

---

## Limitations

- All data from yfinance (15-min delayed for most tickers)
- PCR only covers SPY — doesn't capture individual stock or sector options flow
- 13F institutional data used by Smart Money Scanner is more reliable for long-term positioning
- The 15-minute cache means the index won't reflect rapid intraday moves instantly
- Junk bond and safe haven signals work best in trending environments; choppy/range-bound markets produce noisy readings

---

## Running it

```bash
cd backend && uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

Navigate to **Market Sentiment** in the sidebar. Data loads in ~5 seconds (parallel yfinance downloads).
