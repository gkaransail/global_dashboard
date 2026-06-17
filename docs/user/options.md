# Options Analysis — User Guide

## What does it do?
Shows the live options market for any stock — what strike prices options traders are positioning around, how expensive options are (IV), what the options market implies about future price movement, and where "unusual" institutional bets are showing up.

## Tabs

### Overview
The most important tab. It aggregates everything into one view:

| Metric | What it tells you |
|---|---|
| **Expected Move** | The options market's implied ±price range by expiration |
| **Max Pain** | The price at expiration where the most options expire worthless (market gravitates here) |
| **ATM IV %** | How expensive options are right now |
| **IV Rank** | How expensive vs. the last 52 weeks (0 = cheapest, 100 = most expensive) |
| **P/C Ratio** | Put/call ratio — above 1.0 = more put buying (bearish hedge or fear) |
| **GEX** | Gamma Exposure — positive = market makers dampen volatility, negative = moves get amplified |
| **Short Interest** | % of float sold short |
| **Narrative** | AI-written plain English summary of what all signals mean together |

### Chain
The raw options chain for a specific expiration date. Shows every strike with:
- Bid/Ask/Mid price
- Implied Volatility
- Volume and Open Interest
- Delta, Gamma, Theta, Vega (the Greeks)
- Whether the option is In-The-Money (ITM)

**Green rows = calls, Red rows = puts.** ITM options are highlighted.

### Unusual Activity
Flags contracts where volume is wildly out of proportion to open interest — a sign of new institutional positioning. Each alert shows:
- **Score** — composite unusualness (0–1)
- **Premium Value** — total dollar value of the trade (volume × mid × 100)
- **Sentiment** — whether the trade looks bullish or bearish based on context

High-score unusual activity often precedes significant price moves.

### IV Skew
The "volatility smile" — how IV varies across strikes and expirations.

- **Downward skew** (puts more expensive than calls) = market pricing in downside risk
- **Upward skew** (calls more expensive) = market expects upside breakout
- **Term structure** = how ATM IV changes across different expirations (normal = farther out = higher IV)

### Top 20
Scans ~80 liquid stocks and ranks the top 20 by options signal strength. Each card shows:
- Score and direction (bull/bear)
- Key signal drivers (P/C ratio, max pain, squeeze, IV rank)
- Current spot price

## Key Concepts

**Expected Move** is calculated from the ATM straddle price. If AAPL is at $200 and the straddle costs $10, the market implies ±$10 (±5%) by expiration.

**Max Pain** is where option sellers profit the most. Many stocks gravitate toward max pain as expiration approaches because market makers hedge dynamically.

**Put/Call Ratio < 0.7** = bullish (call buying dominates). **> 1.3** = bearish (put buying dominates).

**IV Rank > 70** = options are expensive — premium selling strategies (covered calls, cash-secured puts) have an edge. **IV Rank < 25** = options are cheap — buying options for directional plays has better risk/reward.
