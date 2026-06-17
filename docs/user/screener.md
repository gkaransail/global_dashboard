# Multi-Factor Screener — User Guide

## What does it do?
The most comprehensive stock-finding tool in the dashboard. Instead of screening on one metric (like "RSI < 30"), it scores every stock across 4 independent dimensions simultaneously and combines them into one composite score. You see which stocks are strong across the board — not just on one factor.

## The 4 Factors

| Factor | Weight | What it measures |
|---|---|---|
| **Technical** | 35% | Price momentum, trend alignment (EMAs), RSI, MACD |
| **Smart Money** | 30% | Unusual options activity, insider buying, reversal signals |
| **Fundamental** | 20% | Valuation, growth rate, financial health |
| **Sentiment** | 15% | News sentiment (FinBERT), fear/greed, put/call ratio |

Technical and smart money are weighted highest because they tend to be more timely signals.

## Tabs

### Screener
The main view. Shows all ~50 stocks ranked by their composite score (0–100).

**Filters:**
- **Sort by** — Rank by composite score, or focus on one factor (e.g., "show me stocks that score highest on smart money")
- **Direction** — All stocks, bullish only (>50), or bearish only (<50)
- **Min Score** — Set a minimum threshold
- **Limit** — How many results to show

**Reading the table:**
- **Composite Score** — Overall ranking. 70+ = strong bull setup. 30- = potential short
- **Factor bars** — Visual breakdown of technical / smart money / fundamental / sentiment
- **Direction badge** — Bullish / Bearish
- **Signals fired** — Which specific conditions triggered (e.g., "above_ema200, low_pe, unusual_call_activity")

### Single Score
Get the full detailed breakdown for any specific ticker — including which individual signals contributed to each factor score.

### Custom Scan
Enter your own list of up to 20 tickers and get them scored side-by-side. Useful for comparing stocks in a sector or screening your own watchlist.

## How to use it

**Morning scan:** Sort by composite, direction = bullish, min score = 65. This gives you the highest-conviction setups across all 4 factors to watch during the trading day.

**Sector comparison:** Enter the major stocks in a sector (e.g., bank stocks: JPM, BAC, WFC, GS, MS) in Custom Scan to see which bank has the best multi-factor setup.

**Confirming a thesis:** Already bullish on a stock? Check its single score — if smart money and technical both score > 65, you have cross-factor confirmation.

## Tip
The screener refreshes every 25 minutes automatically. The first load of the day may take ~30–45 seconds while the background job runs — subsequent loads return in under a second from cache.
