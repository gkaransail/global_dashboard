# Options Analysis

## What It Does

The Options Analysis module translates raw options market data into plain-English signals. It has four sub-tabs:

| Tab | What you learn |
|-----|---------------|
| **Overview** | Overall market sentiment for this stock based on options positioning |
| **Options Chain** | The live bid/ask table for all strikes — where buyers and sellers are |
| **Unusual Activity** | Contracts where volume far exceeds open interest — large directional bets |
| **IV Skew & Term Structure** | How implied volatility changes across strikes and dates |

---

## How to Use It

1. Enter a ticker and select a timeframe from the top bar
2. Start with the **Overview tab** — it gives the 30-second picture
3. Go to **Chain** to see the raw data with the "How to Read" guide open
4. Check **Unusual Activity** for any large institutional bets that just went through
5. Visit **IV Skew** to understand whether the market fears upside or downside more

---

## Options Basics: What Is an Option?

An option is a contract that gives you the **right, but not the obligation**, to buy or sell a stock at a specific price by a specific date.

- **Call option**: Right to *buy* at the strike price → you profit if the stock goes UP
- **Put option**: Right to *sell* at the strike price → you profit if the stock goes DOWN
- **Strike price**: The agreed purchase/sale price in the contract
- **Expiration date**: The deadline for exercising the right
- **Premium**: What you pay for the option (the price quoted in the chain)

**Example**: A AAPL $200 Call expiring in 30 days means: you're paying a premium today for the right to buy 100 shares of AAPL at $200 before that expiration. If AAPL goes to $220, that call becomes very valuable. If AAPL stays at $195, the call expires worthless.

---

## Tab 1: Overview

### What You See

- **Market Outlook card**: Overall sentiment (Bearish / Mildly Bearish / Neutral / Bullish) derived from the Put/Call ratio
- **Expected Move**: The range the market is pricing in by the selected expiration
- **Max Pain**: The price where the most options expire worthless
- **Key OI Levels**: Support and resistance zones created by open interest concentrations
- **IV Context**: Whether implied volatility is high, moderate, or low
- **Glossary**: Plain-English definitions of every term on the page

### How the Sentiment Is Derived

The core signal is the **Put/Call OI Ratio**:

```
P/C Ratio = Total Put Open Interest / Total Call Open Interest
```

| P/C Ratio | Interpretation |
|-----------|---------------|
| > 1.3 | Bearish — put buying dominates, market expects downside |
| 1.0 – 1.3 | Mildly bearish — slight put lean |
| 0.7 – 1.0 | Neutral with bullish lean — balanced to call-heavy |
| < 0.7 | Bullish — call buying dominates, upside positioning |

**Why this works as a sentiment indicator**: When institutions expect a stock to fall, they buy puts to protect themselves (or to profit). Heavy put buying = elevated fear. Heavy call buying = bullish speculation. The ratio gives a snapshot of where money is positioned.

### Expected Move

```
1 Standard Deviation Move = Spot Price × ATM_IV × √(DTE / 365)
```

Where:
- `ATM_IV` = Implied Volatility of the nearest-to-spot strike
- `DTE` = Days to expiration

This is not a prediction — it's what the **options market is pricing in**. If AAPL is at $200 with 30% ATM IV and 30 DTE:

```
Move = $200 × 0.30 × √(30/365) = $200 × 0.30 × 0.286 = $17.17
Range: $182.83 – $217.17
```

Statistically, the stock should stay within this range ~68% of the time (1 standard deviation). Think of it as the market's "uncertainty cone."

### Max Pain

Max pain is the strike price where the **total dollar value of all expiring options is minimized** — i.e., where option buyers lose the most and sellers (market makers) pay out the least.

**The algorithm:**

```
For each possible strike price P:
  call_pain(P) = Σ max(0, P − strike) × call_OI   [calls lose value above this]
  put_pain(P)  = Σ max(0, strike − P) × put_OI    [puts lose value below this]
  total(P)     = call_pain(P) + put_pain(P)

Max Pain = strike P with minimum total(P)
```

**Why traders watch it**: Market makers who have sold options hedge their exposure by trading the underlying stock. As expiration approaches, their hedging activity can "pin" the stock price toward max pain. It's not a rule but a gravitational tendency near expiration.

### Key OI Levels

- **Call OI walls → Resistance**: Large open interest in call strikes above the current price creates a "ceiling." Market makers who sold those calls are short gamma — they'll sell stock as the price rises toward those strikes to hedge, which creates selling pressure.
- **Put OI walls → Support**: Large put open interest below the price creates a "floor." Market makers who sold puts buy stock as the price falls toward those strikes to hedge, creating buying support.

These levels function like self-reinforcing support and resistance — the bigger the OI, the stronger the magnetic effect.

---

## Tab 2: Options Chain

### Layout

```
LEFT SIDE (green)          CENTER          RIGHT SIDE (red)
CALLS                      STRIKE          PUTS
────────────────────────────────────────────────────────
Vol    OI    Last  Bid/Ask  IV%  Δ    │  $195  │  Vol   OI    Last  Bid/Ask  IV%  Δ
                                       │ ◄ ATM ►│
```

Calls are on the **left** (bullish bets). Puts are on the **right** (bearish bets). The center column shows the strike price. The ATM (at-the-money) strike — closest to the current stock price — is highlighted.

### Column Definitions

| Column | Full Name | What It Means |
|--------|-----------|---------------|
| **Vol** | Volume | Contracts traded today. High volume = active interest. |
| **OI** | Open Interest | Total contracts currently open (not yet closed). This is accumulated over time, unlike volume which resets daily. |
| **Last** | Last Price | Most recent trade price for this contract. May be stale for low-volume strikes. |
| **Bid** | Bid Price | What buyers are willing to pay RIGHT NOW. |
| **Ask** | Ask Price | What sellers want RIGHT NOW. Buy at Ask, sell at Bid. The gap (spread) is the market maker's profit. |
| **IV%** | Implied Volatility | The market's forecast of how much this stock will move, expressed as annualized % volatility. Higher IV = more expensive options. |
| **Δ (Delta)** | Delta | How much the option price changes for a $1 move in the stock. Call deltas: 0 to +1. Put deltas: −1 to 0. ATM ≈ 0.50. |
| **θ (Theta)** | Theta | How much value the option loses per day just from time passing. Shown as a negative number. High theta = the clock is working against you. |

### In-the-Money vs Out-of-the-Money

- **In-the-Money (ITM)**: A call is ITM when the strike is *below* the stock price (you could exercise and profit immediately). A put is ITM when the strike is *above* the stock price.
- **At-the-Money (ATM)**: Strike ≈ current stock price. These have the highest time value.
- **Out-of-the-Money (OTM)**: A call is OTM when the strike is *above* the stock price (needs to move up to have value). A put is OTM when the strike is *below* the current price.

### Reading the Chain: 6 Quick Rules

**1. Focus on ATM strikes first**
The ATM contract tells you the true cost of the bet. Its IV% is what the "Expected Move" calculation uses.

**2. Compare Call OI vs Put OI at the same strike**
Heavy call OI at a strike = that level acts as resistance (market makers are hedging by selling the stock as it rises toward there). Heavy put OI = that level acts as support (market makers buy as price approaches).

**3. Volume > OI = Fresh positioning today**
If volume for a contract exceeds its existing open interest, new money is coming in today — someone made a fresh directional bet. This is what "Unusual Activity" detects.

**4. Large OI walls = Price magnets near expiry**
The strikes with the most total OI across calls and puts tend to attract the stock price as expiration approaches (Max Pain effect). If a $200 strike has 50,000 contracts open and the stock is at $198, that $200 level has gravitational pull.

**5. High IV% = Expensive options = Event expected**
IV above 50% for a large-cap stock is high — it means the market expects a significant move. Could be earnings, FDA approval, macro event. High IV also means options decay faster, which hurts buyers.

**6. Theta: time is your enemy when long options**
If an option costs $2.00 and has θ = −0.05, you're losing $5 per day per contract just by holding it. The longer you hold, the more time decay eats your position. This favors sellers of options, not buyers.

### How to Use the Chain as a Directional Signal

**Bullish signals in the chain:**
- Call OI is significantly higher than put OI (overall)
- Volume is concentrated in out-of-the-money calls (speculative upside bets)
- Low put IV relative to call IV (put skew inverted = unusual, means upside fear premium)
- Large call OI wall just above current price that recently got taken out

**Bearish signals in the chain:**
- Put OI >> Call OI
- Heavy put buying at lower strikes (protective puts or directional shorts)
- High put IV relative to call IV (normal put skew — downside fear premium)
- Max pain well below current price (stock is "overextended" vs where options settlement would pin it)

---

## Tab 3: Unusual Activity

### What It Is

Unusual options activity means a contract was traded with **far more volume than expected** given its existing open interest, or with a very large total premium — suggesting an institutional-sized directional bet.

### The Unusualness Score

Every flagged contract is scored 0–1 using three factors:

```
Score = (Vol/OI Score × 0.40) + (Premium Score × 0.40) + (IV Score × 0.20)
```

| Component | Formula | What it captures |
|-----------|---------|-----------------|
| **Vol/OI Score** | min(vol/OI ÷ 10, 1.0) | How far volume exceeds existing open interest. Caps at 10× |
| **Premium Score** | min(log10(premium) ÷ 7.0, 1.0) | Dollar size on log scale. $10M+ = score of 1.0 |
| **IV Score** | (IV − 0.50) ÷ 1.50 if IV > 50%, else 0 | Elevated IV on top of the volume spike |

**Minimum thresholds**: Volume must be ≥ 100 contracts. Score must be ≥ 0.25.

### Reading a Flagged Activity Row

Each row shows:
- **Type**: CALL (bullish) or PUT (bearish)
- **Strike**: The price level of the bet
- **Expiration**: When the contract expires
- **DTE**: Days to expiration
- **Volume**: Contracts traded today
- **OI**: Existing open interest
- **Vol/OI**: The ratio (>1.0 means more volume than existing positions — fresh money)
- **IV%**: Implied volatility of this contract
- **Premium**: Total dollar value = volume × mid price × 100
- **Score**: Composite unusualness score
- **Sentiment**: Bullish or bearish (calls are bullish, puts are bearish, with some nuance for deep ITM)

**Click any row** to see a plain-English explanation: "Someone placed a large $850k call bet at $195 strike expiring Jun 20, suggesting the buyer expects AAPL to be above $195 by then."

### How to Interpret Unusual Activity

**High-conviction signals:**
- Score > 0.7: Very unusual. Large premium + volume >> OI + elevated IV
- Short-dated (DTE < 14) large calls/puts: High-conviction directional play (not a hedge)
- Premium > $1M: Institutional-sized. Someone spent real money with conviction

**Noise / less meaningful:**
- Score 0.25–0.40: Low signal. Could be portfolio hedges or spread legs
- Deep ITM contracts with big volume: Often closing existing positions, not new bets
- Long-dated (DTE > 180) small premium: Likely LEAPS speculation, lower urgency signal

**The "dark pool" of options**: Unusual activity is one of the few public windows into what large money is doing. Retail traders don't spend $2M on a call in one shot. When you see it, it means someone with serious capital and research has taken a position.

---

## Tab 4: IV Skew & Term Structure

### What Is IV Skew?

Implied Volatility is not the same across all strikes. If you plot IV on the Y-axis against strike price on the X-axis, you usually get a "smirk" or "smile" shape rather than a flat line.

**The Volatility Smirk (most common for stocks):**
```
IV%
 |    ●
 |      ●
 |        ●
 |           ●  ●  ●
 |─────────────────────── strike
       low   ATM  high
```
Put strikes have higher IV than call strikes. This is the **put skew** — the market pays more for downside protection than upside speculation. It exists because:
1. Crashes are faster and more violent than rallies (demand for tail-risk protection is asymmetric)
2. Institutions systematically buy puts to hedge portfolios

**The 25-Delta Skew** shown in the dashboard = OTM Put IV (10% below spot) − OTM Call IV (10% above spot). Higher number = more put fear. Negative number = unusual call skew (upside speculation).

### What Is Term Structure?

Term structure plots ATM IV against expiration date:

```
IV%
 |  ●
 |     ●
 |        ●  ●
 |               ●  ●
 |──────────────────────── date
   1w  1mo 3mo 6mo  1y
  (near)            (far)
```

**Contango (normal)**: Near-term IV < Far-term IV. Market is calm now, uncertain about the future. This is the default state.

**Backwardation**: Near-term IV > Far-term IV. An event is happening soon (earnings, FDA, macro) that has elevated near-term uncertainty more than long-term. Classic ahead of earnings.

**What to look for:**
- **Steep contango**: No immediate catalysts, market calm
- **Flat/inverted near dates**: Event risk is right now (buy near-term protection before it collapses after the event)
- **High absolute IV across all dates**: Sustained uncertainty, market in a stressed regime

### Reading the Skew Chart

Each expiration has its own skew curve. The UI shows:
- A chart of call IV and put IV across strikes for the selected expiration
- Moneyness on the X-axis (% from spot): −20% to +20%
- IV% on the Y-axis

**Interpreting the shape:**
- Steep left wing (put IV much higher than ATM): Heavy downside protection demand
- Symmetric (both wings equal): Unusual — market equally worried about up and down
- Steep right wing (call IV higher): Call skew — bullish event premium (e.g., M&A rumor)
- Flat across all strikes: Low-volatility regime, cheap options across the board

---

## Architecture

```
GET /api/v1/options/analysis/{ticker}?timeframe=3mo
        │
        ▼
  analysis.py::get_analysis()
        │
        ├─ yfinance: spot price
        ├─ yfinance: all expiration dates
        ├─ Select best expiration for timeframe (closest to 75% of target DTE)
        ├─ yfinance: full option chain (calls + puts) for that expiration
        │
        ├─ Compute ATM IV (nearest strike to spot)
        ├─ Compute P/C OI Ratio
        ├─ Compute Expected Move = spot × ATM_IV × √(DTE/365)
        ├─ Compute Max Pain (iterate all strikes, minimize total payout)
        ├─ Find Key OI Levels (top 5 call OI + top 5 put OI strikes)
        └─ Generate narrative paragraph
        │
        ▼
GET /api/v1/options/unusual/{ticker}
        │
        ▼
  unusual.py::get_unusual_activity()
        │
        ├─ Fetch up to 6 near-term expirations
        ├─ For each expiration, process all calls and puts:
        │   ├─ Filter: volume ≥ 100
        │   ├─ Score = vol_oi_score × 0.40 + premium_score × 0.40 + iv_score × 0.20
        │   └─ Determine sentiment (call = bullish, put = bearish, with nuance)
        └─ Return top 50 by score, filtered to score ≥ 0.25

GET /api/v1/options/skew/{ticker}
        │
        ▼
  skew.py::get_skew()
        │
        ├─ Fetch up to 8 expirations
        ├─ For each expiration:
        │   ├─ Extract call IV and put IV for strikes ±20% from spot
        │   ├─ Compute 25-delta skew proxy (OTM put IV − OTM call IV)
        │   └─ Compute ATM IV
        └─ Return term structure + per-expiration skew curves
```

**Cache**: All three endpoints use a 3-minute in-memory TTL cache. The same ticker + timeframe request won't hit yfinance twice within 3 minutes.

---

## Timeframe → Expiration Mapping

When you select a timeframe, the backend picks the expiration closest to 75% of that window:

| Timeframe | Target DTE window | Explanation |
|-----------|-------------------|-------------|
| 1H | 1 day | Shortest available, same-day or next-day expiration |
| 1D | 3 days | 0DTE or 1DTE options |
| 1W | 7 days | Weekly options |
| 1M | 30 days | Monthly options |
| 3M | 90 days | Quarterly |
| 6M | 180 days | Semi-annual |
| 1Y | 365 days | LEAPS |
| 5Y | 730 days | Long-dated LEAPS |

Not every ticker has every expiration. The system always falls back to the nearest available.

---

## Learning Options Trading

### Beginner Path

1. **Understand calls and puts**: What each is, when they make money, what "exercise" means
2. **Understand premium and intrinsic/extrinsic value**: Why options have time value
3. **Learn the Greeks one by one**: Delta first (directional sensitivity), then Theta (time decay), then Vega (IV sensitivity)
4. **Read the chain**: Practice identifying ATM, ITM, OTM contracts and what their prices mean
5. **Paper trade**: Most brokers offer paper (simulated) trading — buy a call or put with virtual money and see how the Greeks change in real time

### Key Concepts to Study

| Concept | Why It Matters |
|---------|---------------|
| **Intrinsic Value** | What an option is worth if exercised today (in-the-money amount) |
| **Extrinsic / Time Value** | The premium above intrinsic — pure time + uncertainty pricing |
| **Implied Volatility** | The market's forward-looking uncertainty estimate baked into option prices. IV rising = options getting more expensive. |
| **IV Rank / IV Percentile** | Is current IV high or low relative to its own history? IV Rank 80 means IV is in the 80th percentile of the past year. |
| **Greeks** | Delta (directional), Gamma (delta's rate of change), Theta (time decay), Vega (IV sensitivity), Rho (rate sensitivity) |
| **Options Expiry Cycles** | Monthly (3rd Friday), Weekly (every Friday), 0DTE (same-day expiry for SPX/SPY) |
| **Put-Call Parity** | Mathematical relationship that keeps call and put prices in equilibrium |

### Recommended Resources

| Resource | What To Learn |
|----------|--------------|
| *Options as a Strategic Investment* — Lawrence McMillan | Comprehensive reference for all strategies |
| *The Options Playbook* — Brian Overby | Free at optionsplaybook.com, beginner-friendly strategy guide |
| Tastytrade YouTube channel | Practical mechanics of options trading, IV-focused |
| CBOE Learning Center (cboe.com) | Official exchange education, Greeks explainers |
| *Option Volatility and Pricing* — Sheldon Natenberg | Deep dive into IV, pricing models, and trading professionally |

---

## Common Mistakes

| Mistake | Why It Hurts |
|---------|-------------|
| Buying far OTM options for "lottery tickets" | They have low delta but high theta — they decay fast and need a huge move to profit |
| Ignoring IV when buying options | Buying when IV is elevated means you overpay; the option can lose value even if the stock moves in your direction |
| Holding through expiration when wrong | Options can go to zero; cutting losses early preserves capital |
| Confusing volume with open interest | Volume is today's activity. OI is the total outstanding contracts. High volume + low OI = fresh position. |
| Misreading the bid-ask spread | Always use limit orders; wide spreads mean the market maker takes a large cut |
