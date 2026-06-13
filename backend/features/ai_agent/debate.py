"""
Bull vs Bear Agent Debate.

Two Claude agents argue opposite sides of the same ticker using identical data.
The disagreement score quantifies uncertainty — high disagreement = reduce position size.

Architecture:
  1. Gather all market data upfront (price, reversal, options, fundamentals, news sentiment)
  2. Run BULL agent  — system prompt biases it to find bullish evidence
  3. Run BEAR agent  — system prompt biases it to find bearish evidence
  4. Run JUDGE agent — synthesises both arguments into a final verdict + conviction score

This pattern is used by quant funds to:
  - Surface risks the primary analyst missed
  - Quantify uncertainty (disagreement = uncertainty)
  - Generate more balanced research
"""
from __future__ import annotations

import json
import logging
from features.ai_agent.agent import execute_tool
from core import llm

logger = logging.getLogger(__name__)

# ── System prompts ───────────────────────────────────────────────────────────

_BULL_SYSTEM = """You are a BULLISH equity analyst. Your job is to build the strongest possible bull case for the stock you're analyzing.

You have been given comprehensive market data. Your task:
1. Identify every bullish signal in the data — technical, fundamental, options flow, insider buying, positive news
2. Explain WHY each signal is bullish with specific numbers
3. Anticipate the bear case and pre-emptively rebut it
4. Conclude with a clear price target and the key catalysts that could drive it there

Be rigorous and data-driven. Do not fabricate data — only use what's provided.
Format: structured sections with headers. End with "BULL VERDICT: [Strong/Moderate/Weak] — [one sentence]"."""

_BEAR_SYSTEM = """You are a BEARISH equity analyst. Your job is to build the strongest possible bear case for the stock you're analyzing.

You have been given comprehensive market data. Your task:
1. Identify every bearish signal in the data — deteriorating technicals, stretched valuation, put buying, insider selling, negative news
2. Explain WHY each signal is bearish with specific numbers
3. Anticipate the bull case and pre-emptively rebut it
4. Conclude with a downside target and the key risks that could drive the stock lower

Be rigorous and data-driven. Do not fabricate data — only use what's provided.
Format: structured sections with headers. End with "BEAR VERDICT: [Strong/Moderate/Weak] — [one sentence]"."""

_JUDGE_SYSTEM = """You are an impartial senior portfolio manager judging a debate between a bull analyst and a bear analyst on the same stock.

Your task:
1. Summarize the strongest argument from each side (2-3 points each)
2. Identify where they AGREE (these are high-conviction facts)
3. Identify the KEY DISAGREEMENT — the single most important point of contention
4. Score the debate: who made the stronger case and why
5. Assign a CONVICTION score from 0-100:
   - 0-30: High uncertainty, signals conflict, avoid or very small position
   - 31-60: Moderate conviction, mixed signals, normal position sizing
   - 61-80: Good conviction, signals mostly aligned
   - 81-100: High conviction, strong confirmation across all signals

Output format:
BULL STRENGTHS: [2-3 bullets]
BEAR STRENGTHS: [2-3 bullets]
KEY AGREEMENT: [one fact both sides accept]
KEY DISAGREEMENT: [the crux of the debate]
WINNER: [Bull/Bear/Draw] — [reason]
CONVICTION: [0-100]
FINAL VERDICT: [Buy/Hold/Sell] with [position size: Full/Half/Quarter/Avoid]
SUMMARY: [2-3 sentence synthesis for a portfolio manager]"""


# ── Data gathering ────────────────────────────────────────────────────────────

def _gather_data(ticker: str) -> str:
    """Fetch all available signals upfront and format as a context block."""
    tools_to_run = [
        ("get_price_data",       {"ticker": ticker}),
        ("get_reversal_analysis", {"ticker": ticker}),
        ("get_options_analysis",  {"ticker": ticker}),
        ("get_fundamentals",      {"ticker": ticker}),
        ("get_insider_activity",  {"ticker": ticker}),
        ("get_news_sentiment",    {"ticker": ticker, "max_items": 10}),
    ]

    sections = []
    for tool_name, inputs in tools_to_run:
        try:
            raw = execute_tool(tool_name, inputs)
            data = json.loads(raw)
            sections.append(f"=== {tool_name.upper()} ===\n{json.dumps(data, indent=2)}")
        except Exception as e:
            sections.append(f"=== {tool_name.upper()} ===\n{{\"error\": \"{e}\"}}")

    return "\n\n".join(sections)


# ── Single agent call (no tool loop — data already gathered) ─────────────────

def _run_analyst(system: str, ticker: str, data_block: str, max_tokens: int = 1500) -> str:
    try:
        return llm.complete(
            system,
            f"Analyze {ticker} using the following market data:\n\n{data_block}\n\nBuild your case using only the data above.",
            max_tokens=max_tokens,
        )
    except Exception as e:
        return f"Agent failed: {e}"


# ── Parse conviction score from judge output ──────────────────────────────────

def _parse_conviction(judge_text: str) -> int:
    import re
    match = re.search(r"CONVICTION[:\s]+(\d+)", judge_text, re.IGNORECASE)
    if match:
        return min(100, max(0, int(match.group(1))))
    return 50  # default if not found


def _parse_verdict(judge_text: str) -> str:
    import re
    match = re.search(r"FINAL VERDICT[:\s]+([^\n]+)", judge_text, re.IGNORECASE)
    return match.group(1).strip() if match else "See analysis"


# ── Public API ────────────────────────────────────────────────────────────────

def run_debate(ticker: str) -> dict:
    """
    Run the full bull vs bear debate for a ticker.
    Returns both arguments, the judge's verdict, and a conviction score.
    """
    if not llm.is_configured():
        return {"error": "No AI provider configured. Add GROQ_API_KEY to backend/.env"}

    ticker = ticker.upper()

    data_block    = _gather_data(ticker)
    bull_argument = _run_analyst(_BULL_SYSTEM, ticker, data_block, max_tokens=1200)
    bear_argument = _run_analyst(_BEAR_SYSTEM, ticker, data_block, max_tokens=1200)

    judge_input    = f"TICKER: {ticker}\n\nBULL ANALYST ARGUMENT:\n{bull_argument}\n\nBEAR ANALYST ARGUMENT:\n{bear_argument}"
    judge_response = _run_analyst(_JUDGE_SYSTEM, ticker, judge_input, max_tokens=800)

    conviction = _parse_conviction(judge_response)
    verdict    = _parse_verdict(judge_response)

    # Disagreement score: 100 - conviction (high disagreement = low conviction)
    disagreement = 100 - conviction

    return {
        "ticker":         ticker,
        "bull_argument":  bull_argument,
        "bear_argument":  bear_argument,
        "judge_verdict":  judge_response,
        "conviction":     conviction,
        "disagreement":   disagreement,
        "final_verdict":  verdict,
        "sizing_guidance": _size_guidance(conviction),
    }


def _size_guidance(conviction: int) -> str:
    if conviction >= 80:
        return "Full position — strong signal confirmation across all sources"
    if conviction >= 60:
        return "Half to full position — good signal alignment, manage risk"
    if conviction >= 40:
        return "Quarter to half position — mixed signals, keep stops tight"
    return "Avoid or very small position — high disagreement, wait for clarity"
