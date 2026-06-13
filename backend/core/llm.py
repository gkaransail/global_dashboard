"""
LLM provider abstraction — Groq (free) or Anthropic (paid).

Priority:
  1. AI_PROVIDER env var if explicitly set ("groq" or "anthropic")
  2. Auto-detect: Groq if GROQ_API_KEY present, else Anthropic
  3. Returns helpful error if neither key is configured

Usage:
  from core import llm

  # Agentic tool-use loop (research, chat)
  text = llm.run_loop(messages, system, tools, execute_tool_fn)

  # Single-turn (summaries, briefings)
  text = llm.complete(system, user_message)

  # Check availability before calling
  if not llm.is_configured(): return {"error": "..."}
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable

logger = logging.getLogger(__name__)

GROQ_MODEL      = "llama-3.3-70b-versatile"
ANTHROPIC_MODEL = "claude-sonnet-4-6"

# ── Provider detection ────────────────────────────────────────────────────────

def _provider() -> str:
    """Return 'groq', 'anthropic', or 'none'."""
    from core.config import settings
    pref = (settings.ai_provider or "").lower()
    if pref in ("groq", "anthropic"):
        return pref
    if settings.groq_api_key:
        return "groq"
    if settings.anthropic_api_key:
        return "anthropic"
    return "none"


def is_configured() -> bool:
    return _provider() != "none"


def provider_name() -> str:
    return _provider()


# ── Client factory ────────────────────────────────────────────────────────────

def _groq_client():
    from core.config import settings
    try:
        from groq import Groq
        return Groq(api_key=settings.groq_api_key)
    except ImportError:
        raise RuntimeError("groq package not installed — run: pip install groq")


def _anthropic_client():
    from core.config import settings
    try:
        import anthropic
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    except ImportError:
        raise RuntimeError("anthropic package not installed — run: pip install anthropic")


# ── Tool format conversion ────────────────────────────────────────────────────

def _to_openai_tools(anthropic_tools: list[dict]) -> list[dict]:
    """Anthropic tool schema → OpenAI/Groq tool schema."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for t in anthropic_tools
    ]


# ── Groq agentic loop ─────────────────────────────────────────────────────────

def _groq_loop(
    messages: list[dict],
    system: str,
    tools: list[dict],
    execute_fn: Callable[[str, dict], str],
    max_tokens: int,
) -> str:
    client = _groq_client()
    openai_tools = _to_openai_tools(tools)
    loop_msgs = [{"role": "system", "content": system}] + list(messages)

    for _ in range(10):
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=loop_msgs,
            tools=openai_tools,
            tool_choice="auto",
            max_tokens=max_tokens,
            temperature=0.2,
        )
        choice = resp.choices[0]

        if choice.finish_reason == "stop":
            return choice.message.content or ""

        if choice.finish_reason == "tool_calls":
            tcs = choice.message.tool_calls or []
            # Add assistant message preserving tool_calls
            loop_msgs.append({
                "role": "assistant",
                "content": choice.message.content,
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tcs
                ],
            })
            # Execute each tool and append results
            for tc in tcs:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}
                result = execute_fn(tc.function.name, args)
                loop_msgs.append({"role": "tool", "tool_call_id": tc.id, "content": result})
        else:
            return choice.message.content or "Analysis could not be completed."

    return "Analysis reached maximum iterations."


# ── Anthropic agentic loop ────────────────────────────────────────────────────

def _anthropic_loop(
    messages: list[dict],
    system: str,
    tools: list[dict],
    execute_fn: Callable[[str, dict], str],
    max_tokens: int,
) -> str:
    client = _anthropic_client()
    loop_msgs = list(messages)

    for _ in range(10):
        resp = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=loop_msgs,
        )
        if resp.stop_reason == "end_turn":
            return next((b.text for b in resp.content if hasattr(b, "text")), "")

        if resp.stop_reason == "tool_use":
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    result = execute_fn(block.name, block.input)
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
            loop_msgs.append({"role": "assistant", "content": resp.content})
            loop_msgs.append({"role": "user", "content": results})
        else:
            return next((b.text for b in resp.content if hasattr(b, "text")), "Analysis could not be completed.")

    return "Analysis reached maximum iterations."


# ── Public API ────────────────────────────────────────────────────────────────

def run_loop(
    messages: list[dict],
    system: str,
    tools: list[dict],
    execute_fn: Callable[[str, dict], str],
    max_tokens: int = 2048,
) -> str:
    """
    Run the agentic tool-use loop with whichever provider is configured.
    `tools` should be in Anthropic format — converted automatically for Groq.
    """
    p = _provider()
    if p == "groq":
        return _groq_loop(messages, system, tools, execute_fn, max_tokens)
    if p == "anthropic":
        return _anthropic_loop(messages, system, tools, execute_fn, max_tokens)
    return "No AI provider configured. Add GROQ_API_KEY to backend/.env"


def complete(system: str, user_message: str, max_tokens: int = 1024) -> str:
    """Single-turn completion without tools. Fast path for summaries/briefings."""
    p = _provider()
    if p == "none":
        return "No AI provider configured. Add GROQ_API_KEY to backend/.env"

    if p == "groq":
        client = _groq_client()
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system",  "content": system},
                {"role": "user",    "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""

    client = _anthropic_client()
    resp = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    return next((b.text for b in resp.content if hasattr(b, "text")), "")
