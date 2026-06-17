# News Sentiment (FinBERT) — Developer Reference

## Purpose
Runs FinBERT (financial-domain BERT) on stock news headlines and article summaries to produce sentiment scores. Also supports free-form text analysis and multi-ticker comparison.

## Files
```
backend/features/sentiment_ai/
├── router.py     API endpoints
└── finbert.py    score_text(), analyze_news_articles(), score_batch()
core/
├── news.py       fetch_ticker_news(), fetch_market_news() — RSS + yfinance
frontend/src/features/sentiment_ai/
└── index.jsx     Tab router: news / analyze / compare
```

## API Endpoints (`/api/v1/sentiment_ai`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/news/{ticker}` | Fetch news + FinBERT score each article |
| `GET` | `/market` | Score general market news from RSS feed |
| `POST` | `/analyze` | Score any free-form text |
| `POST` | `/batch` | Score up to 50 texts in one call |
| `GET` | `/compare` | Compare news sentiment across up to 6 tickers |

### `/news/{ticker}` params
- `max_items: int` — 1–30 articles (default 15)
- Cache key: `sentiment_ai_news_{ticker}_{max_items}`, TTL 900s

### `/market` params
- `feed: str` — `yahoo_finance | reuters_markets | marketwatch`
- `max_items: int` — 1–40 articles (default 20)

### `/compare` params
- `tickers: str` — comma-separated, e.g. `AAPL,MSFT,NVDA` (max 6)
- `max_items: int` — articles per ticker (default 10)
- Sorted by `avg_compound` descending

## FinBERT Pipeline (`finbert.py`)

Model: `ProsusAI/finbert` loaded via HuggingFace `transformers` (AutoTokenizer + AutoModelForSequenceClassification).

```
Input text
  → tokenize (max 512 tokens, truncate)
  → forward pass through FinBERT
  → softmax → {positive, negative, neutral} probabilities
  → compound score = positive - negative  (range −1 to +1)
```

### `score_text(text)` returns:
```json
{
  "label": "positive",
  "compound": 0.63,
  "positive": 0.71,
  "negative": 0.08,
  "neutral": 0.21
}
```

### `analyze_news_articles(articles)` returns:
```json
{
  "articles": [...with per-article sentiment...],
  "aggregate": {
    "avg_compound": 0.24,
    "positive_count": 8,
    "negative_count": 3,
    "neutral_count": 4,
    "bullish_pct": 53,
    "bearish_pct": 20,
    "label": "Mildly Bullish"
  }
}
```

## News Fetching (`core/news.py`)
- Ticker news: yfinance `t.news` (returns recent articles with title, summary, publisher)
- Market news: RSS feeds from Yahoo Finance, Reuters Markets, MarketWatch
- Articles are truncated to title + first 200 chars of summary before scoring (FinBERT limit)

## Model Loading
FinBERT is loaded once at startup (module level). First call may take 5–10s to download if not cached. Model lives in HuggingFace cache (`~/.cache/huggingface`).

## Performance
Batch scoring is ~50ms per text on CPU (M-series Mac). For 15 articles: ~750ms. Use `/batch` for efficiency.
