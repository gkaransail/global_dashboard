# AI Research Agent — Developer Reference

## Purpose
LLM-powered research assistant that gathers multi-source financial data and generates summaries, deep research reports, interactive chat, and bull vs bear debate.

## Files
```
backend/features/ai_agent/
├── router.py   POST /summary, /research, /chat, /debate
├── agent.py    generate_summary(), generate_research(), generate_chat_response()
└── debate.py   generate_debate()
core/
└── llm.py      LLM provider abstraction — Groq or Anthropic
frontend/src/features/ai_agent/
└── index.jsx   Tab router: summary / research / chat / debate
```

## API Endpoints (`/api/v1/ai_agent`)

| Method | Path | Request body | Description |
|---|---|---|---|
| `POST` | `/summary` | `{ticker}` | Quick 2–4 paragraph market note |
| `POST` | `/research` | `{ticker, question}` | Deep agentic research with tool use |
| `POST` | `/chat` | `{ticker, messages[]}` | Stateless multi-turn research chat |
| `POST` | `/debate` | `{ticker}` | Bull vs Bear argument debate |

All endpoints return `{"error": "No AI provider configured", "setup_instructions": "..."}` when no LLM key is configured.

## LLM Provider (`core/llm.py`)
Abstraction layer supporting:
- **Groq** — Fast, free tier available. Set `GROQ_API_KEY` in `backend/.env`
- **Anthropic** — Set `ANTHROPIC_API_KEY` in `backend/.env`

`is_configured()` returns False if neither key is present.

Priority: Groq if `GROQ_API_KEY` set, else Anthropic.

## Summary Generation (`agent.py::generate_summary`)
1. Gather context: `get_quote()`, `get_analysis()` (options), `analyze_ticker()` (reversal), `get_overview()` (fundamentals)
2. Build a structured prompt with all gathered data
3. Call LLM with `temperature=0.3` for factual accuracy
4. Return raw LLM text

## Research Agent (`agent.py::generate_research`)
Uses tool-calling (function calling) with these tools available to the LLM:
- `get_price_data` → calls reversal/quote endpoint
- `get_options_analysis` → calls options/analysis endpoint
- `get_fundamentals` → calls fundamental/overview endpoint
- `get_news_sentiment` → calls sentiment_ai/news endpoint
- `get_insider_activity` → calls insider/summary endpoint

LLM orchestrates multiple tool calls to gather exactly what it needs to answer the question, then synthesizes a response. Implements an agentic loop (max 5 iterations).

## Chat (`agent.py::generate_chat_response`)
Stateless — client sends full message history. System prompt includes:
- Current ticker context (price, options overview, reversal signal)
- Tool access to all the same tools as Research

## Debate (`debate.py::generate_debate`)
Makes two LLM calls:
1. Bull case prompt — LLM argues strongest bullish case
2. Bear case prompt — LLM argues strongest bearish case

Returns both as a structured debate response with a neutral summary.

## Request Model
```python
class SummaryRequest(BaseModel): ticker: str
class ResearchRequest(BaseModel): ticker: str; question: str = "..."
class ChatRequest(BaseModel): ticker: str; messages: list[ChatMessage]
class ChatMessage(BaseModel): role: str; content: str  # "user" or "assistant"
```

## No API Key
When `llm.is_configured()` returns False, router returns the `_NO_KEY_RESPONSE` dict (200 OK with error message in body — not an HTTP error). Frontend detects the `error` field and shows setup instructions.
