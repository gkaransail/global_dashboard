# Backtest & RL Optimizer — User Guide

## What does it do?
Every time you look at a stock's Options Analysis, the dashboard quietly logs what the signals are predicting. After the set time window (e.g., 30 days for a 1-month analysis), it checks whether the prediction was right. Over time, it learns which signals are actually predictive and adjusts how much it trusts each one.

Think of it as a self-improving prediction journal.

## How predictions are logged
You don't need to do anything. Every time you view Options Analysis for a stock, the dashboard automatically records:
- What the signals said (bullish/bearish/neutral)
- The score (–5 to +5, based on P/C ratio, max pain, IV rank, squeeze)
- The stock's price at that moment
- When to check the outcome

**One prediction per stock per timeframe per day** — it won't spam duplicates.

## The Dashboard

### Stat Cards
- **Total Logged** — how many predictions have been recorded
- **Evaluated** — how many have been checked against actual prices
- **Pending** — predictions whose evaluation window hasn't closed yet
- **Win Rate** — % of evaluated predictions where the direction was correct
- **Avg Return** — average actual price change in the predicted direction
- **Bull/Bear Win Rate** — accuracy split by direction

### Performance by Timeframe
Win rates broken down by 1W, 1M, 3M, etc. Longer timeframes generally have better signal.

### Signal Weights (RL Learned)
Each signal has a base weight and a current weight. The system adjusts weights based on which signals actually predicted correctly:
- **Green drift** = this signal is performing better than expected — gets more influence in future scoring
- **Red drift** = this signal is hurting more than helping — gets less influence
- **Accuracy %** = out of all predictions where this signal fired, what % were correct

## Buttons

### 📋 Scan Watchlist (N)
Immediately runs Options Analysis on all N tickers in your watchlist and logs predictions. Useful for building your prediction history quickly across your favorite stocks.

### ▶ Evaluate Matured
Checks all predictions whose time window has closed (e.g., a 1-month prediction logged 30 days ago). Compares the prediction against today's price and marks it correct or wrong.

### ⚡ Force Evaluate All
Evaluates every pending prediction right now, regardless of the time window. Good for testing, but note: prices need time to move — same-day force evaluation will show ~0% move and artificially low win rates.

### 🧠 Run RL Training
After evaluating predictions, click this to update the signal weights. The algorithm learns which signals reliably predicted direction and adjusts them.

### ↺ Reset Weights
Resets all signal weights back to their starting values. Use this if you want to start fresh (e.g., after making major changes to your strategy).

## What to expect over time

| Period | What you see |
|---|---|
| Day 1–7 | Predictions accumulating, nothing evaluated yet |
| Day 30 | First 1-month predictions evaluate. Win rate data appears |
| Day 60+ | Meaningful RL training. Signal weights start drifting |
| Day 90+ | 3-month predictions evaluate. Enough data for reliable win rates |

A win rate of 55%+ across 50+ predictions means the signals have real predictive value. Below 50% means they're currently unreliable (though RL will start correcting this automatically).

## Prediction source labels
- **analysis** (grey) — logged when you viewed Options Analysis
- **watchlist** (purple) — logged via Scan Watchlist
- **top 20** (amber) — logged from the Top 20 scanner (coming soon)
