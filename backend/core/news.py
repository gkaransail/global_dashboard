"""
News fetching layer.

Two sources, no API key required:
  1. yfinance .news  — Yahoo Finance news per ticker (fast, structured)
  2. feedparser      — RSS feeds (Reuters, Seeking Alpha, MarketWatch) for macro news
"""
import logging
from datetime import datetime, timezone
from typing import Optional
import feedparser
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 min


# ── RSS feeds (no auth needed) ───────────────────────────────────────────────

RSS_FEEDS = {
    "reuters_markets":   "https://feeds.reuters.com/reuters/businessNews",
    "marketwatch":       "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    "seeking_alpha":     "https://seekingalpha.com/market_currents.xml",
    "yahoo_finance":     "https://finance.yahoo.com/news/rssindex",
}


def fetch_ticker_news(ticker: str, max_items: int = 15) -> list[dict]:
    """Fetch recent news for a ticker via yfinance."""
    cache_key = f"news_ticker_{ticker}_{max_items}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    ticker = ticker.upper()
    try:
        t = yf.Ticker(ticker)
        raw = t.news or []
        articles = []
        for item in raw[:max_items]:
            content = item.get("content", [])
            # yfinance returns nested content blocks
            body = ""
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        body = block.get("body", "")
                        break
            elif isinstance(content, str):
                body = content

            articles.append({
                "title":     item.get("title", ""),
                "summary":   item.get("summary", body)[:500],
                "url":       item.get("link", item.get("url", "")),
                "source":    item.get("publisher", "Yahoo Finance"),
                "published": _ts_to_iso(item.get("providerPublishTime") or item.get("published_parsed")),
                "ticker":    ticker,
            })
        _cache.set(cache_key, articles)
        return articles
    except Exception as e:
        logger.warning(f"fetch_ticker_news({ticker}): {e}")
        return []


def fetch_market_news(feed: str = "yahoo_finance", max_items: int = 20) -> list[dict]:
    """Fetch general market news from an RSS feed."""
    cache_key = f"news_market_{feed}_{max_items}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    url = RSS_FEEDS.get(feed, RSS_FEEDS["yahoo_finance"])
    try:
        parsed = feedparser.parse(url)
        articles = []
        for entry in parsed.entries[:max_items]:
            articles.append({
                "title":     entry.get("title", ""),
                "summary":   entry.get("summary", "")[:500],
                "url":       entry.get("link", ""),
                "source":    feed.replace("_", " ").title(),
                "published": _ts_to_iso(entry.get("published_parsed")),
                "ticker":    None,
            })
        _cache.set(cache_key, articles)
        return articles
    except Exception as e:
        logger.warning(f"fetch_market_news({feed}): {e}")
        return []


def _ts_to_iso(ts) -> Optional[str]:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        if hasattr(ts, "tm_year"):
            return datetime(*ts[:6], tzinfo=timezone.utc).isoformat()
    except Exception:
        pass
    return None
