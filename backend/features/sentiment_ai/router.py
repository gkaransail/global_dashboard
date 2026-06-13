from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.news import fetch_ticker_news, fetch_market_news
from features.sentiment_ai.finbert import score_text, analyze_news_articles
from core import cache as _cache

router = APIRouter()


class TextRequest(BaseModel):
    text: str


class BatchRequest(BaseModel):
    texts: list[str]


@router.get("/news/{ticker}")
async def news_sentiment(
    ticker: str,
    max_items: int = Query(15, ge=1, le=30),
):
    """
    Fetch latest news for a ticker and score each headline + summary with FinBERT.
    Returns per-article sentiment + aggregate bull/bear/neutral breakdown.
    """
    cache_key = f"sentiment_ai_news_{ticker}_{max_items}"
    cached = _cache.get(cache_key, 900)
    if cached:
        return cached

    articles = fetch_ticker_news(ticker.upper(), max_items)
    if not articles:
        raise HTTPException(status_code=404, detail=f"No news found for {ticker}")

    result = analyze_news_articles(articles)
    result["ticker"] = ticker.upper()
    _cache.set(cache_key, result)
    return result


@router.get("/market")
async def market_sentiment(
    feed: str = Query("yahoo_finance", description="Feed: yahoo_finance | reuters_markets | marketwatch"),
    max_items: int = Query(20, ge=1, le=40),
):
    """
    Fetch general market news from an RSS feed and score it with FinBERT.
    Gives a real-time read on overall market tone.
    """
    articles = fetch_market_news(feed, max_items)
    if not articles:
        raise HTTPException(status_code=404, detail=f"No articles from feed: {feed}")

    result = analyze_news_articles(articles)
    result["feed"] = feed
    return result


@router.post("/analyze")
async def analyze_text(req: TextRequest):
    """
    Score any free-form text with FinBERT.
    Use this for earnings call excerpts, analyst comments, or custom text.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    return score_text(req.text)


@router.post("/batch")
async def analyze_batch(req: BatchRequest):
    """
    Score multiple texts in one batch call.
    More efficient than calling /analyze repeatedly.
    """
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts list cannot be empty")
    if len(req.texts) > 50:
        raise HTTPException(status_code=400, detail="max 50 texts per batch")

    from features.sentiment_ai.finbert import score_batch
    scores = score_batch(req.texts)
    return {"results": [{"text": t[:100], "sentiment": s} for t, s in zip(req.texts, scores)]}


@router.get("/compare")
async def compare_tickers(
    tickers: str = Query(..., description="Comma-separated tickers, e.g. AAPL,MSFT,NVDA"),
    max_items: int = Query(10, ge=3, le=20),
):
    """
    Compare news sentiment across multiple tickers side-by-side.
    Returns each ticker's aggregate sentiment score for easy comparison.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",")][:6]
    results = []

    for ticker in ticker_list:
        try:
            articles = fetch_ticker_news(ticker, max_items)
            if not articles:
                results.append({"ticker": ticker, "aggregate": None, "article_count": 0})
                continue
            analysis = analyze_news_articles(articles)
            results.append({
                "ticker":        ticker,
                "aggregate":     analysis["aggregate"],
                "article_count": len(articles),
            })
        except Exception as e:
            results.append({"ticker": ticker, "error": str(e)})

    # Sort by avg_compound descending (most bullish first)
    results.sort(
        key=lambda r: r.get("aggregate", {}).get("avg_compound", 0) if r.get("aggregate") else 0,
        reverse=True,
    )
    return {"comparisons": results}
