"""
AI Research Agent — provider-agnostic (Groq free tier or Anthropic).
Set GROQ_API_KEY in backend/.env to use Groq (free, default).
Set ANTHROPIC_API_KEY to use Anthropic as fallback.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "get_price_data",
        "description": (
            "Get the current price, absolute and percentage change, and volume "
            "for a stock ticker."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_reversal_analysis",
        "description": (
            "Get multi-factor reversal signal analysis for a ticker: technical, macro, "
            "breadth, and sentiment scores combined into an overall direction and "
            "confidence level."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
                "lookback_days": {
                    "type": "integer",
                    "default": 90,
                    "description": "Number of historical days to use for the analysis.",
                },
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_options_analysis",
        "description": (
            "Get options market analysis for a ticker: ATM implied volatility, "
            "put/call open-interest ratio, expected move, and max pain level."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_fundamentals",
        "description": (
            "Get fundamental data for a ticker: PE ratio, forward PE, market cap, "
            "revenue growth, profit margins, debt-to-equity, and analyst target price."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_insider_activity",
        "description": (
            "Get the most recent insider buying and selling transactions for a ticker "
            "(up to 5 most recent)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_news",
        "description": (
            "Fetch the latest news headlines and summaries for a stock ticker. "
            "Use this to understand recent events, catalysts, or sentiment drivers "
            "that may not be reflected in price data yet."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"},
                "max_items": {"type": "integer", "default": 10, "description": "Number of articles to return (max 15)"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_news_sentiment",
        "description": (
            "Analyze the sentiment of recent news for a ticker using FinBERT, a financial "
            "NLP model trained specifically on financial text. Returns per-article sentiment "
            "scores (positive/negative/neutral) and an aggregate bull/bear score. "
            "Use this alongside price and technical data to understand whether news flow "
            "is supporting or contradicting the technical signal."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
                "max_items": {"type": "integer", "default": 10},
            },
            "required": ["ticker"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def execute_tool(name: str, inputs: dict) -> str:  # always returns JSON string
    ticker = inputs.get("ticker", "").upper()
    lookback_days = inputs.get("lookback_days", 90)

    try:
        if name == "get_price_data":
            return _get_price_data(ticker)

        if name == "get_reversal_analysis":
            return _get_reversal_analysis(ticker, lookback_days)

        if name == "get_options_analysis":
            return _get_options_analysis(ticker)

        if name == "get_fundamentals":
            return _get_fundamentals(ticker)

        if name == "get_insider_activity":
            return _get_insider_activity(ticker)

        if name == "get_news":
            return _get_news(ticker, inputs.get("max_items", 10))

        if name == "get_news_sentiment":
            return _get_news_sentiment(ticker, inputs.get("max_items", 10))

        return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        logger.warning("Tool %s failed for %s: %s", name, ticker, e)
        return json.dumps({"error": str(e), "ticker": ticker})


# ---------------------------------------------------------------------------
# Individual tool implementations
# ---------------------------------------------------------------------------

def _get_price_data(ticker: str) -> str:
    t = yf.Ticker(ticker)
    info = t.fast_info
    price = float(info.last_price)
    prev_close = float(info.previous_close) if info.previous_close else price
    change_abs = round(price - prev_close, 4)
    change_pct = round((change_abs / prev_close) * 100, 2) if prev_close else 0.0
    volume = int(info.three_month_average_volume or 0)
    return json.dumps({
        "ticker": ticker,
        "price": round(price, 4),
        "change_abs": change_abs,
        "change_pct": change_pct,
        "avg_volume_3mo": volume,
    })


def _get_reversal_analysis(ticker: str, lookback_days: int) -> str:
    try:
        from features.reversal.signals.composite import analyze_ticker
        result = analyze_ticker(ticker, explain=False, lookback_days=lookback_days)
        breakdown = result.methodology_breakdown or {}
        return json.dumps({
            "ticker": ticker,
            "direction": result.direction.value,
            "confidence": result.confidence,
            "strength": result.strength.value,
            "signal_counts": result.signal_counts,
            "methodology_breakdown": {
                cat: {
                    "score": info.get("score", 0),
                    "signal_count": info.get("signal_count", 0),
                }
                for cat, info in breakdown.items()
            },
            "top_signals": [
                {
                    "name": s.name,
                    "category": s.category,
                    "direction": s.direction.value,
                    "strength": s.strength,
                    "explanation": s.explanation,
                }
                for s in sorted(result.signals, key=lambda x: x.strength, reverse=True)[:6]
            ],
        })
    except Exception as e:
        return json.dumps({"error": f"Reversal analysis unavailable: {e}", "ticker": ticker})


def _get_options_analysis(ticker: str) -> str:
    try:
        from features.options.analyzers.analysis import get_analysis
        data = get_analysis(ticker, timeframe="1mo")
        return json.dumps({
            "ticker": ticker,
            "spot_price": data.get("spot_price"),
            "atm_iv_pct": data.get("atm_iv_pct"),
            "pc_ratio": data.get("pc_ratio"),
            "total_call_oi": data.get("total_call_oi"),
            "total_put_oi": data.get("total_put_oi"),
            "expected_move": data.get("expected_move"),
            "max_pain": data.get("max_pain"),
            "selected_expiration": data.get("selected_expiration"),
            "narrative": data.get("narrative"),
        })
    except Exception as e:
        return json.dumps({"error": f"Options analysis unavailable: {e}", "ticker": ticker})


def _get_fundamentals(ticker: str) -> str:
    t = yf.Ticker(ticker)
    info = t.info

    def _safe(key, default=None):
        val = info.get(key, default)
        if val is None:
            return default
        try:
            if isinstance(val, float) and (val != val):  # NaN check
                return default
            return val
        except Exception:
            return default

    market_cap = _safe("marketCap")
    if market_cap:
        if market_cap >= 1e12:
            market_cap_str = f"${market_cap/1e12:.2f}T"
        elif market_cap >= 1e9:
            market_cap_str = f"${market_cap/1e9:.2f}B"
        else:
            market_cap_str = f"${market_cap/1e6:.0f}M"
    else:
        market_cap_str = None

    return json.dumps({
        "ticker": ticker,
        "pe_trailing": _safe("trailingPE"),
        "pe_forward": _safe("forwardPE"),
        "price_to_book": _safe("priceToBook"),
        "price_to_sales": _safe("priceToSalesTrailing12Months"),
        "market_cap": market_cap,
        "market_cap_str": market_cap_str,
        "revenue_growth_yoy": _safe("revenueGrowth"),
        "earnings_growth_yoy": _safe("earningsGrowth"),
        "gross_margins": _safe("grossMargins"),
        "operating_margins": _safe("operatingMargins"),
        "profit_margins": _safe("profitMargins"),
        "debt_to_equity": _safe("debtToEquity"),
        "current_ratio": _safe("currentRatio"),
        "return_on_equity": _safe("returnOnEquity"),
        "return_on_assets": _safe("returnOnAssets"),
        "analyst_target_price": _safe("targetMeanPrice"),
        "analyst_recommendation": _safe("recommendationKey"),
        "number_of_analysts": _safe("numberOfAnalystOpinions"),
        "sector": _safe("sector"),
        "industry": _safe("industry"),
    })


def _get_insider_activity(ticker: str) -> str:
    t = yf.Ticker(ticker)
    try:
        df = t.insider_transactions
        if df is None or df.empty:
            return json.dumps({"ticker": ticker, "transactions": [], "summary": "No recent insider transactions found."})

        # Normalise column names (yfinance returns different shapes)
        df = df.reset_index(drop=True)
        records = []
        for _, row in df.head(8).iterrows():
            rec: dict[str, Any] = {}
            for col in df.columns:
                val = row[col]
                # serialise non-JSON-native types
                try:
                    if hasattr(val, "isoformat"):
                        rec[col] = val.isoformat()
                    elif hasattr(val, "item"):
                        rec[col] = val.item()  # numpy scalar
                    else:
                        rec[col] = val
                except Exception:
                    rec[col] = str(val)
            records.append(rec)

        # Quick summary
        buy_count = sum(
            1 for r in records
            if any("buy" in str(r.get(k, "")).lower() or "purchase" in str(r.get(k, "")).lower()
                   for k in r)
        )
        sell_count = len(records) - buy_count
        summary = f"{len(records)} recent transactions: ~{buy_count} buys, ~{sell_count} sells."

        return json.dumps({"ticker": ticker, "transactions": records, "summary": summary})
    except Exception as e:
        return json.dumps({"ticker": ticker, "transactions": [], "error": str(e)})


def _get_news(ticker: str, max_items: int = 10) -> str:
    try:
        from core.news import fetch_ticker_news
        articles = fetch_ticker_news(ticker, max_items=min(max_items, 15))
        if not articles:
            return json.dumps({"ticker": ticker, "articles": [], "message": "No recent news found."})
        # Return lightweight version — title + summary + source + date
        lightweight = [
            {
                "title":     a["title"],
                "summary":   a["summary"][:200],
                "source":    a["source"],
                "published": a["published"],
            }
            for a in articles
        ]
        return json.dumps({"ticker": ticker, "article_count": len(lightweight), "articles": lightweight})
    except Exception as e:
        return json.dumps({"error": str(e), "ticker": ticker})


def _get_news_sentiment(ticker: str, max_items: int = 10) -> str:
    try:
        from core.news import fetch_ticker_news
        from features.sentiment_ai.finbert import analyze_news_articles
        articles = fetch_ticker_news(ticker, max_items=min(max_items, 15))
        if not articles:
            return json.dumps({"ticker": ticker, "message": "No news to analyze."})
        result = analyze_news_articles(articles)
        # Return aggregate + top positive/negative headlines (not full article list)
        top_positive = [
            a["title"] for a in result["articles"]
            if a["sentiment"]["label"] == "positive"
        ][:3]
        top_negative = [
            a["title"] for a in result["articles"]
            if a["sentiment"]["label"] == "negative"
        ][:3]
        return json.dumps({
            "ticker":        ticker,
            "aggregate":     result["aggregate"],
            "top_positive":  top_positive,
            "top_negative":  top_negative,
        })
    except Exception as e:
        return json.dumps({"error": str(e), "ticker": ticker})


# ---------------------------------------------------------------------------
# Agentic loop — delegates to core.llm (Groq or Anthropic)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are an expert financial analyst with deep knowledge of technical analysis, options markets, fundamental investing, and news-driven catalysts. You have access to real-time market data tools.

When analysing a stock:
1. Always start by fetching current price data.
2. Check reversal signals for technical momentum.
3. Look at options activity for institutional positioning.
4. Review fundamentals for valuation context.
5. Check insider activity as a confidence signal.
6. Fetch recent news to identify catalysts, risks, or events driving the move.
7. Analyze news sentiment with FinBERT to quantify whether news flow is bullish or bearish.

When news sentiment conflicts with technical signals, flag this explicitly as a risk.
Synthesise all data into a clear research note. Use specific numbers. Do not give personalised financial advice."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_summary(ticker: str) -> dict:
    """Quick one-shot summary — gathers data upfront, single LLM call."""
    from core import llm
    if not llm.is_configured():
        return {"error": "No AI provider configured. Add GROQ_API_KEY to backend/.env"}

    ticker = ticker.upper()
    price_data    = _safe_json(execute_tool("get_price_data",       {"ticker": ticker}))
    reversal_data = _safe_json(execute_tool("get_reversal_analysis", {"ticker": ticker}))
    fundamentals  = _safe_json(execute_tool("get_fundamentals",      {"ticker": ticker}))

    context = (
        f"PRICE DATA:\n{json.dumps(price_data, indent=2)}\n\n"
        f"REVERSAL SIGNALS:\n{json.dumps(reversal_data, indent=2)}\n\n"
        f"FUNDAMENTALS:\n{json.dumps(fundamentals, indent=2)}"
    )
    system = (
        "You are a senior financial analyst. Write a concise, factual 2–4 paragraph "
        "market summary covering: current price and trend, key technical signals, "
        "valuation context. Use bullet points for key facts. Be specific with numbers. "
        "Do not give personalised financial advice."
    )
    try:
        text = llm.complete(system, f"Write a quick market summary for {ticker}.\n\n{context}", max_tokens=1024)
        return {"summary": text, "ticker": ticker}
    except Exception as e:
        logger.exception("generate_summary failed for %s", ticker)
        return {"error": str(e), "ticker": ticker}


def generate_research(ticker: str, question: str) -> dict:
    """Deep research: full agentic tool-use loop — LLM picks its own tools."""
    from core import llm
    if not llm.is_configured():
        return {"error": "No AI provider configured. Add GROQ_API_KEY to backend/.env"}

    ticker = ticker.upper()
    messages = [{
        "role": "user",
        "content": (
            f"Conduct a thorough analysis of {ticker}.\n\n"
            f"Research question: {question}\n\n"
            "Use the available tools to gather price data, technical signals, "
            "options positioning, fundamentals, and insider activity. "
            "Synthesise your findings into a research note that directly answers the question."
        ),
    }]
    try:
        text = llm.run_loop(messages, _SYSTEM_PROMPT, TOOLS, execute_tool, max_tokens=2048)
        return {"research": text, "ticker": ticker, "question": question}
    except Exception as e:
        logger.exception("generate_research failed for %s", ticker)
        return {"error": str(e), "ticker": ticker, "question": question}


def generate_chat_response(ticker: str, messages: list[dict]) -> dict:
    """Stateless chat — full conversation history in, next message out."""
    from core import llm
    if not llm.is_configured():
        return {"error": "No AI provider configured. Add GROQ_API_KEY to backend/.env"}

    ticker = ticker.upper()
    system = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"The user is researching {ticker}. When they say 'the stock' or 'it', they mean {ticker}. "
        "Use tools to fetch fresh data when asked about prices, signals, or quantitative info."
    )

    try:
        from core import llm
        text = llm.run_loop(messages, system, TOOLS, execute_tool, max_tokens=1024)
        return {"content": text, "role": "assistant", "ticker": ticker}
    except Exception as e:
        logger.exception("generate_chat_response failed for %s", ticker)
        return {"error": str(e), "ticker": ticker}


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _safe_json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}
