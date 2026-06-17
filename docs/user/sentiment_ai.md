# News Sentiment — User Guide

## What does it do?
Uses an AI model (FinBERT, trained specifically on financial text) to read the news and tell you whether the sentiment is bullish, bearish, or neutral — for any stock or for the market overall. Unlike generic sentiment models, FinBERT understands financial language (e.g., "revenue beat estimates" = positive, "margin pressure" = negative).

## Tabs

### News Feed
Pulls the latest news articles for your selected stock and scores each one. You see:

- **Per-article score** — Bullish / Bearish / Neutral + compound score (−1 to +1)
- **Aggregate summary** — What % of articles are bullish vs bearish overall
- **Aggregate label** — "Strongly Bullish", "Mildly Bearish", etc.

**Use it for:** Pre-market research, checking news catalysts, understanding what the media narrative is.

### Text Analyzer
Paste any text — an earnings call excerpt, an analyst note, a tweet, a press release — and get it scored instantly. Useful for:
- Earnings call transcripts
- Fed statements
- Company press releases
- Analyst upgrades/downgrades

### Compare
Side-by-side news sentiment comparison for up to 6 tickers. Useful for:
- Comparing sector peers (which has the most positive news right now?)
- Checking sector rotation narratives
- Validating a thesis ("is the news as bullish as the chart suggests?")

## Understanding the Scores

| Compound Score | Meaning |
|---|---|
| +0.5 to +1.0 | Very bullish news |
| +0.1 to +0.5 | Mildly bullish |
| −0.1 to +0.1 | Neutral / mixed |
| −0.5 to −0.1 | Mildly bearish |
| −1.0 to −0.5 | Very bearish news |

## Important limitations
- **Sentiment ≠ price movement.** Stocks can go up on bad news and down on good news.
- **News lags price.** By the time it's news, institutional traders often already knew.
- **FinBERT reads words, not context.** Irony, sarcasm, and nuance can trip it up.
- **Best as a confirming signal**, not a primary signal. Strong bullish options flow + strongly bullish news = conviction. Bullish news alone is weaker.
