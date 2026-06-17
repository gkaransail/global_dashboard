# Federation — User Guide

## What Is Federation?

Federation lets two independent dashboards collaborate. You and a friend each run your own Global Dashboard, and federation lets you:

- **Compare signals** — see if your dashboard and your friend's agree on a stock's direction
- **Pool prediction data** — share evaluated trades so both models learn from more history
- **Merge RL weights** — blend the signal importance scores both dashboards learned separately

The result: better prediction accuracy from twice the data, without sharing anything personal.

---

## How It Works (Plain English)

Your dashboard tracks every analysis prediction it makes and eventually grades each one: did the stock go the direction it expected? Over time, it learns which signals (IV rank, put/call ratio, squeeze, etc.) are more reliable.

Your friend's dashboard does the same independently. With federation, you can:

1. Send your graded predictions to your friend → their model learns from your trades too
2. They send theirs to you → your model learns from their trades
3. Merge the signal importance scores → both dashboards benefit from the combined learning

No user data is shared. Only three pieces of information travel between dashboards:
- What ticker, what direction, what timeframe
- What the actual return was
- Whether the prediction was correct

---

## Setting It Up

### Step 1 — Expose your dashboard

Install ngrok (free) and run:
```bash
ngrok http 8000
```

You'll get a URL like `https://abc123.ngrok.io`. Share that with your friend.

### Step 2 — Connect Claude Code (optional but recommended)

This lets Claude compare your dashboards conversationally:
```bash
claude mcp add my-dashboard --transport sse --url http://localhost:8000/mcp/sse
claude mcp add friend-dashboard --transport sse --url https://<their-ngrok-url>/mcp/sse
```

Your friend does the same in reverse with your ngrok URL.

---

## Using the Federation Panel

The Federation panel is at the bottom of the **Backtest & RL** tab.

### Ping a Peer

Enter your friend's ngrok URL and click **Ping Peer**. If they're online you'll see their stats: how many predictions they've evaluated and their win rate.

### Compare Signals

Enter a ticker (e.g. AAPL) and click **Compare Signals**. The panel shows both dashboards' readings side by side. Fields highlighted in red mean the two models disagree — that's a sign of uncertainty, so be more cautious on that ticker.

Fields shown:
- **PC Ratio** — put/call ratio (higher = more bearish positioning)
- **IV Rank** — implied volatility percentile
- **Direction** — bullish / bearish / neutral
- **Squeeze** — whether the stock is in a volatility squeeze
- **GEX** — gamma exposure environment
- **Options Flow** — unusual options activity

### Sync Predictions

Click **Sync Predictions** to import your friend's evaluated trades into your database. Your dashboard will use them next time RL training runs.

After syncing, click **Run RL Training** (in the RL Weights panel above) to update your signal weights using the expanded dataset.

### Merge Weights

Click **Merge Weights** to blend both dashboards' learned signal weights proportionally. The merge is weighted by sample count — the dashboard with more data has more influence on the result.

---

## Via Claude Code (AI-Assisted)

Once both dashboards are added to Claude Code as MCP servers, you can ask Claude directly:

> "Compare NVDA between my dashboard and my friend's"

> "Sync predictions from my friend's dashboard and retrain"

> "Do we agree on TSLA direction?"

Claude will call the right tools automatically and summarize the findings.

---

## What the Numbers Mean

| Metric | What it tells you |
|--------|------------------|
| Win rate | % of graded predictions where direction was correct |
| Signal count | How many signals the RL model is tracking |
| Weights | Multipliers applied to each signal (>1 = signal is performing well) |

After merging, weights shift toward a blend of both dashboards' learned values. If your friend's model has much more data, you'll see larger shifts.

---

## Privacy & Security

- **What's shared:** Ticker, timeframe, direction, return %, correct/incorrect
- **What's never shared:** Account data, personal info, raw price history
- **Who can connect:** Anyone with your ngrok URL — only share it with people you trust
- **ngrok sessions expire:** Free ngrok URLs change each session; paid ngrok plans give fixed URLs
