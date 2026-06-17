# Portfolio Tracker — User Guide

## What does it do?
Tracks your stock positions and shows live profit/loss. Enter your shares and cost basis once — the dashboard looks up the current price automatically and calculates your unrealized P&L in real time.

## Tabs

### Holdings
Your position list with live data for each:

| Column | What it shows |
|---|---|
| **Ticker** | Stock symbol |
| **Shares** | Number of shares you hold |
| **Cost Basis** | Your average purchase price per share |
| **Current Price** | Live price from the market |
| **Day Change** | % change today |
| **Total Cost** | Shares × cost basis (what you paid) |
| **Current Value** | Shares × current price (what it's worth now) |
| **Unrealized P&L** | Current value − total cost |
| **P&L %** | Return percentage since purchase |

The summary at the top shows your total portfolio cost, current value, and overall P&L.

### Adding a Position
Click "Add Position" and enter:
- **Ticker** — e.g. AAPL
- **Shares** — number of shares (decimals allowed for fractional shares)
- **Cost Basis** — your average purchase price per share
- **Date Added** — when you bought (optional, for your records)

### P&L Summary
A visual breakdown of your portfolio:
- Total cost vs current value
- P&L by position (which holdings are your winners/losers)
- Allocation by position (what % of your portfolio is each stock)

## Updating or Removing Positions
- **Update** — Click the edit icon on any position to update shares or cost basis (e.g., after adding more shares or tax-loss harvesting)
- **Remove** — Delete a position when you've sold it

## Tips
- **Cost basis** should be your average price per share across all purchases (if you bought at different prices, use the weighted average)
- For fractional shares (e.g., from Robinhood), enter the exact fractional number
- The tracker shows **unrealized P&L only** — it does not track realized gains from closed positions
- Prices update each time you load or refresh the page (not real-time streaming)

## Privacy note
Portfolio data is stored locally in the dashboard's backend. It is not synced to any cloud service or third party. If you restart the backend fresh (clearing `backend/data/portfolio.json`), your positions will be lost.
