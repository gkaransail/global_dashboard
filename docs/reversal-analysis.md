# Trend Reversal Analysis

## What It Does

The Reversal Analysis feature answers one question: **is this stock likely to reverse direction soon?** It runs 4 categories of signals simultaneously, weights them, and produces a single verdict — Bullish Reversal, Bearish Reversal, or Neutral — with a confidence percentage and strength label (Weak / Moderate / Strong).

This is a **signal aggregator**, not a price predictor. It tells you the weight of evidence pointing in each direction, not a guaranteed outcome.

---

## How to Use It

1. **Enter a ticker** in the top bar (e.g. `AAPL`, `SPY`, `TSLA`) and press Enter or click **Analyze**
2. **Pick a timeframe** — this controls the lookback window used to fetch historical data:
   - **Intraday (1H / 1D / 1W)**: short-term signals, 7–30 days of data
   - **Swing (1M / 3M / 6M)**: medium-term, 30–180 days
   - **Long (1Y / 5Y)**: multi-month trend, up to 1825 days
3. **Read the Verdict Card** — direction, confidence bar, and signal count summary
4. **Check Methodology Breakdown** — see which of the 4 categories are bullish vs bearish
5. **Scroll to All Signals** — every individual signal that fired, sorted by strength
6. Toggle **"Explain why"** to get a plain-English breakdown written from the signal data

---

## Architecture

```
User Request (ticker + timeframe)
        │
        ▼
  composite.py::analyze_ticker()
        │
        ├─► MacroSignalAnalyzer       (30% weight)
        ├─► TechnicalSignalAnalyzer   (35% weight)
        ├─► BreadthSignalAnalyzer     (20% weight)
        └─► SentimentSignalAnalyzer   (15% weight)
                │
                ▼
        Each analyzer returns List[IndividualSignal]
        (name, direction, strength 0–1, explanation)
                │
                ▼
        Per-category mean of direction scores
        (-1 = fully bearish, +1 = fully bullish)
                │
                ▼
        Weighted composite score = Σ(category_score × weight)
                │
                ▼
        composite > +0.08  → BULLISH REVERSAL
        composite < -0.08  → BEARISH REVERSAL
        else               → NEUTRAL
                │
                ▼
        confidence = abs(composite_score)
        strength:  ≥0.70 = Strong, ≥0.45 = Moderate, <0.45 = Weak
```

**Data source**: yfinance (free, real-time delayed). All OHLCV data and macro tickers are fetched fresh on each request and held in a 3-minute in-memory TTL cache.

---

## The Four Signal Categories

### 1. Technical (35% weight)

Signals derived entirely from the stock's own price and volume history.

| Signal | What it detects | Direction |
|--------|----------------|-----------|
| **RSI Oversold** | RSI < 30 | Bullish |
| **RSI Overbought** | RSI > 70 | Bearish |
| **RSI Bullish Divergence** | Price makes lower low, RSI makes higher low | Bullish |
| **RSI Bearish Divergence** | Price makes higher high, RSI makes lower high | Bearish |
| **MACD Bullish Crossover** | MACD histogram crosses zero (negative → positive) | Bullish |
| **MACD Bearish Crossover** | MACD histogram crosses zero (positive → negative) | Bearish |
| **MACD Histogram Weakening** | Histogram shrinking while in trend direction | Reversal |
| **Bollinger Band Squeeze** | Bandwidth < 70% of 20-day avg → breakout imminent | Both |
| **Price at Lower Band** | Price ≤ lower Bollinger Band | Bullish |
| **Price at Upper Band** | Price ≥ upper Bollinger Band | Bearish |
| **Golden Cross** | 50MA crossed above 200MA in last 5 bars | Bullish (0.80 strength) |
| **Death Cross** | 50MA crossed below 200MA in last 5 bars | Bearish (0.80 strength) |
| **Price Far Below 200MA** | Price > 15% below 200-day MA | Bullish |
| **Price Extended Above 200MA** | Price > 25% above 200-day MA | Bearish |
| **Volume Divergence (Up/Down)** | Price rising, volume declining | Bearish |
| **Volume Contraction in Downtrend** | Price falling, volume also declining | Bullish |
| **High-Volume Capitulation** | Price falling on 1.5× average volume spike | Bullish (0.70) |

**How RSI works**: RSI = 100 − (100 / (1 + avg_gain/avg_loss)) over 14 periods. Below 30 = oversold (potential bounce). Above 70 = overbought (potential pullback). Divergence is more reliable — the price and indicator disagree about trend strength.

**How MACD works**: Fast EMA(12) − Slow EMA(26) = MACD line. Signal = EMA(9) of MACD line. Histogram = MACD − Signal. When histogram crosses zero the trend is reversing. Shrinking histogram = momentum fading.

### 2. Macro (30% weight)

Signals from the broader macro environment — these are market-wide forces that affect all stocks.

| Signal | Ticker | What it means |
|--------|--------|---------------|
| **Gold Rising** | GLD / GC=F | Risk-off sentiment — investors hiding in gold, bearish for stocks |
| **Gold Falling** | GLD | Risk appetite returning, bullish for stocks |
| **Dollar Strengthening (DXY)** | DX-Y.NYB | Strong dollar = headwind for multinationals and commodities |
| **Dollar Weakening** | DX-Y.NYB | Weak dollar = tailwind for exports and commodities |
| **VIX Extreme Fear** | ^VIX > 35 | Panic stage — contrarian buy signal (extremes revert) |
| **VIX Elevated Fear** | ^VIX > 25 | Elevated risk, watch for capitulation |
| **VIX Complacency** | ^VIX < 13 | Euphoria — often precedes sharp selloffs |
| **Oil Price Crash** | CL=F < −15% | Deflationary signal, hurts energy and cyclicals |
| **Oil Price Surge** | CL=F > +15% | Inflationary pressure, may trigger Fed hawkishness |
| **10Y Yield Spiking** | ^TNX > 4% and rising | Rate pressure compresses valuations, hurts growth stocks |
| **10Y Yield Falling** | ^TNX falling | Easing rates = higher equity valuations |
| **Copper Rising** | HG=F > +5% | "Dr. Copper" = global expansion signal, bullish |
| **Copper Falling** | HG=F < −5% | Economic slowdown warning |
| **Gold + DXY Both Rising** | Both | Classic flight-to-safety panic — both safe havens bid simultaneously |

**Why Gold + DXY together is special**: Normally gold and the dollar move opposite (gold priced in USD). When *both* rise simultaneously, it signals pure panic — investors want *any* safe asset, which means extreme risk-off pressure on stocks.

### 3. Breadth (20% weight)

Market breadth measures whether a move is broad (healthy, sustainable) or narrow (fragile, concentrated).

| Signal | What it detects |
|--------|----------------|
| **Sector Rotation: Defensives Leading** | XLU/XLP/XLV outperforming XLY/XLK/XLF/XLI by 4%+ → risk-off |
| **Sector Rotation: Cyclicals Leading** | Cyclicals outperforming defensives by 4%+ → risk-on |
| **Breadth Thrust** | 80%+ of sectors in uptrend → broad, durable rally |
| **Breadth Collapse** | 80%+ of sectors in downtrend → systemic selling |
| **Narrow Market Leadership Fading** | Few sectors up, most down → concentrated rally cracking |
| **Strong Relative Strength vs S&P** | Stock outperforms SPX by 10%+ → leadership |
| **Relative Weakness vs S&P** | Stock lags SPX by 10%+ → laggard, avoid in downturns |
| **Sectors Near 52-Week Highs** | 60%+ of sector ETFs near highs → late-cycle euphoria |
| **Sectors Near 52-Week Lows** | 50%+ of sector ETFs near lows → washout, contrarian bullish |

**Defensive sectors**: XLU (Utilities), XLP (Consumer Staples), XLV (Healthcare) — these hold up or outperform when investors are scared.

**Cyclical sectors**: XLY (Discretionary), XLK (Tech), XLF (Financials), XLI (Industrials), XLB (Materials) — these lead when investors are optimistic about economic growth.

### 4. Sentiment (15% weight)

Derived signals that capture investor psychology and institutional behavior.

| Signal | How it's computed |
|--------|-------------------|
| **Fear & Greed: Extreme Fear (<25)** | Composite of VIX (40%) + S&P momentum (40%) + Gold/SP ratio (20%) |
| **Fear & Greed: Fear (25–40)** | Same composite, mild fear reading |
| **Fear & Greed: Extreme Greed (>80)** | Euphoria → contrarian bearish |
| **Smart Money Accumulation (Wyckoff)** | Up-volume > 65% of total over 20 days while price is flat |
| **Smart Money Distribution (Wyckoff)** | Down-volume > 65% while price is flat → institutions unloading |
| **Momentum Exhaustion (7+ Up Days)** | 7+ consecutive up closes → overbought, pullback probable |
| **Momentum Exhaustion (7+ Down Days)** | 7+ consecutive down closes → oversold bounce likely |
| **Uptrend Rate-of-Change Decelerating** | Recent 5-day ROC < 40% of prior 10-day ROC |
| **Multiple Gap-Up Days** | 2+ gap-ups > 3% in last 5 days → exhaustion risk |
| **Multiple Gap-Down Days** | 2+ gap-downs in last 5 days → capitulation, gap-fill bounces |

**Wyckoff theory explained**: Richard Wyckoff observed that institutions (the "smart money") can't buy or sell large positions quickly without moving the price. Instead they slowly accumulate (buy quietly into weakness) or distribute (sell quietly into strength). The tell is volume — heavy up-volume while price doesn't move = accumulation; heavy down-volume while price is stable = distribution.

---

## How the Score Is Calculated

1. Every fired signal has a `strength` from 0 to 1 and a `direction` (Bullish = +1, Bearish = −1, Neutral = 0)
2. For each category, take the **mean of (direction × strength)** across all signals in that category
3. Multiply each category score by its weight (technical 35%, macro 30%, breadth 20%, sentiment 15%)
4. Sum to get a composite score from −1.0 to +1.0
5. Threshold: > +0.08 = Bullish, < −0.08 = Bearish, else Neutral
6. `confidence = |composite_score|`

```
composite_score =  (technical_avg × 0.35)
                 + (macro_avg × 0.30)
                 + (breadth_avg × 0.20)
                 + (sentiment_avg × 0.15)
```

---

## Understanding the Output

### Verdict Card
- **Direction**: The overall call. Green = Bullish Reversal, Red = Bearish Reversal, Gray = Neutral
- **Signal counts**: e.g. "7B / 3B / 12 total" = 7 bullish signals, 3 bearish, 12 total
- **Confidence bar**: Visual representation of |composite_score|. Higher = more conviction
- **Strength badge**: Weak (<45%), Moderate (45–70%), Strong (>70%)

### Methodology Breakdown
Four cards, one per category. Each shows:
- The weighted score for that category (+% = bullish lean, −% = bearish lean)
- The direction call for that category
- How many individual signals fired

A **bullish reversal** is most reliable when **multiple categories agree** — e.g., technical oversold + macro supportive + breadth thrusting. A reading driven by only one category should be treated with more caution.

### Signal List
Sorted by strength (highest conviction first). Each row shows:
- Dot color: green = bullish, red = bearish
- Signal name and category tag
- Explanation of what specifically triggered
- Strength percentage
- Raw value (e.g., RSI value, % deviation from MA)

---

## What Makes a Good Setup

**Strong bullish reversal setup:**
- RSI < 30 with bullish divergence
- Price at or below lower Bollinger Band
- VIX elevated (>25) or extreme fear reading
- Defensive sectors showing fatigue / cyclicals starting to lead
- Smart money accumulation pattern
- 10Y yields declining

**Strong bearish reversal setup:**
- RSI > 70 with bearish divergence
- MACD histogram shrinking while positive
- Gold + DXY both rising
- Sector rotation firmly defensive
- 7+ consecutive up days (momentum exhaustion)
- Extremely low VIX (complacency)

---

## Limitations

- **No earnings calendar**: The tool doesn't know if an earnings report is tomorrow. A "bearish reversal" before a surprise earnings beat is still wrong.
- **Macro signals are market-wide**: They push the analysis toward the market direction, not the specific stock's direction.
- **Not a timing tool**: "Reversal likely" does not mean "reversal today." Signals can persist for days or weeks before a turn.
- **Historical data only**: No forward guidance, analyst estimates, or news sentiment.
- **This is informational only**: Not financial advice. Always use alongside your own research.

---

## Learning Resources

If you want to go deeper on the underlying concepts:

| Topic | What to study |
|-------|--------------|
| RSI and momentum | J. Welles Wilder's *New Concepts in Technical Trading Systems* |
| MACD | Gerald Appel's original 1979 paper; any technical analysis textbook |
| Bollinger Bands | John Bollinger's *Bollinger on Bollinger Bands* |
| Wyckoff method | *The Wyckoff Method* by Jack Hutson; free resources at wyckoffanalytics.com |
| Market breadth | Stan Weinstein's *Secrets for Profiting in Bull and Bear Markets* |
| Macro intermarket | John Murphy's *Intermarket Technical Analysis* |
| Fear & Greed | CNN's Fear & Greed Index methodology (publicly documented) |
