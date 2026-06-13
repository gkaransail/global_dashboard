"""
AI Research Agent router.

Endpoints:
  POST /summary   — quick single-shot ticker summary
  POST /research  — deep agentic research with tool use
  POST /chat      — stateless multi-turn research chat
"""
from fastapi import APIRouter
from pydantic import BaseModel

from core import llm
from features.ai_agent.agent import (
    generate_chat_response,
    generate_research,
    generate_summary,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class SummaryRequest(BaseModel):
    ticker: str


class ResearchRequest(BaseModel):
    ticker: str
    question: str = "What is the overall outlook for this stock?"


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    ticker: str
    messages: list[ChatMessage]


# ---------------------------------------------------------------------------
# Shared key-check helper
# ---------------------------------------------------------------------------

_NO_KEY_RESPONSE = {
    "error": "No AI provider configured",
    "setup_instructions": (
        "Add GROQ_API_KEY=gsk_... to backend/.env for free Groq access (groq.com), "
        "or ANTHROPIC_API_KEY for Anthropic. Then restart: pm2 restart financeiq-backend"
    ),
}


def _api_key_missing() -> bool:
    return not llm.is_configured()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/summary")
async def summary(req: SummaryRequest):
    """
    Quick AI-generated summary for a ticker.
    Gathers price, reversal, and fundamental data then asks Claude to
    write a 2–4 paragraph market note.
    """
    if _api_key_missing():
        return _NO_KEY_RESPONSE

    result = generate_summary(req.ticker)
    if "error" in result:
        return result
    return result


@router.post("/research")
async def research(req: ResearchRequest):
    """
    Deep research: runs the full agentic tool-use loop.
    Claude decides which tools to invoke (price, reversal, options,
    fundamentals, insider) and synthesises a thorough research note.
    """
    if _api_key_missing():
        return _NO_KEY_RESPONSE

    result = generate_research(req.ticker, req.question)
    if "error" in result:
        return result
    return result


@router.post("/chat")
async def chat(req: ChatRequest):
    """
    Stateless research chat.
    Pass the full conversation history; Claude responds with the next
    assistant message. Tools are available mid-conversation.
    """
    if _api_key_missing():
        return _NO_KEY_RESPONSE

    # Convert Pydantic models → plain dicts for the agent
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    result = generate_chat_response(req.ticker, messages)
    if "error" in result:
        return result
    return result


@router.post("/debate")
async def debate(req: SummaryRequest):
    """
    Bull vs Bear agent debate.
    Two Claude agents argue opposite sides; a judge scores conviction (0-100).
    High conviction = strong signal alignment. Low = conflicting signals, reduce size.
    """
    if _api_key_missing():
        return _NO_KEY_RESPONSE

    from features.ai_agent.debate import run_debate
    return run_debate(req.ticker)
