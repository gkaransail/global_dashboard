# Alerts & Watchlist — User Guide

## What does it do?
Two things in one tab: a watchlist for tracking stocks you care about with live prices, and a customizable alert system that notifies you when specific conditions are met.

## Tabs

### Watchlist
A list of stocks you're tracking with live prices and 1-day change. Add any ticker by typing it and clicking Add.

Each row shows:
- Current price
- 1-day absolute and % change (green = up, red = down)

This is your personal monitoring list — separate from the main ticker bar at the top. Use it to track stocks you're researching, positions you don't own yet, or names you're watching for entry signals.

### Price Alerts
Create alerts that fire when a specific condition is met:

**Alert types:**
| Type | Example use |
|---|---|
| **Price** | "Alert me when AAPL crosses above $200" |
| **Reversal Confidence** | "Alert me when NVDA's reversal signal confidence exceeds 0.75" |
| **Smart Money Score** | "Alert me when TSLA's smart money score drops below 40" |

**To create an alert:**
1. Enter the ticker
2. Select alert type (price, reversal confidence, or smart money score)
3. Select condition (above or below)
4. Enter the threshold value
5. Add an optional note to remind yourself why you set it

**Checking alerts:**
Click "Check Alerts" to run a live check against all your active alerts. Any that have triggered will appear highlighted. Triggered alerts stay visible until you reset or delete them — click "Reset" to re-arm one so it can fire again.

## Alert type details

### Price alert
Simple price trigger. "AAPL above $220" fires the first time AAPL's last price exceeds $220.

### Reversal Confidence alert
More sophisticated — fires based on the reversal signal's conviction level, not just price.
- **Above 0.7** = "alert me when the reversal signal becomes highly bullish/bearish"
- **Below 0.3** = "alert me when the reversal signal loses conviction"

### Smart Money Score alert
Uses the Multi-Factor Screener's smart money sub-score (0–100).
- **Above 70** = institutional and options flow aligning bullishly
- **Below 30** = smart money turning negative

## Tips
- Set a **price alert just below support** to know if a stock you like is breaking down
- Set a **reversal confidence alert above 0.7** on a stock you're watching to get notified when a setup forms
- After an alert fires, **reset it** (don't delete) if you want to be alerted again next time the condition triggers
- The "Check Alerts" button runs manually — alerts are not automatically checked in the background unless you have the dashboard open and click it
