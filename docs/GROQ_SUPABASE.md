# Groq + Supabase Integration

## What We're Building

FinanceIQ uses **Groq** as its AI brain and **Supabase** as its persistent memory layer. Together they power a research-grade stock analysis system that runs free, survives server restarts, and gets smarter over time.

---

## Groq — The AI Engine

### What it is
Groq is a free AI inference platform running open-source models (Llama 3.3 70B). It's OpenAI-compatible, has a generous free tier (14,400 requests/day), and supports tool use — meaning the AI can call functions and act on the results, not just answer questions.

### What we use it for

#### 1. Stock Summary (`POST /api/v1/ai_agent/summary`)
One-shot analysis of any ticker. The agent pulls live price, reversal signals, and fundamentals, then writes a 2–4 paragraph market note — the kind of thing a junior analyst would spend 20 minutes writing.

#### 2. Deep Research (`POST /api/v1/ai_agent/research`)
Agentic tool-use loop. You ask a question like *"Is NVDA overvalued?"* and the AI decides which tools to call (price, options, fundamentals, insider activity, news sentiment), runs them, reads the results, and synthesises a full research note. It loops until it has enough data to answer.

#### 3. Research Chat (`POST /api/v1/ai_agent/chat`)
Multi-turn conversation about a stock. The full message history is sent each turn so the AI maintains context. Tools are available mid-conversation — you can ask follow-up questions and it will fetch fresh data to answer them.

#### 4. Bull vs Bear Debate (`POST /api/v1/ai_agent/debate`)
Three-agent system:
- **Bull agent** — builds the strongest possible long case using all available data
- **Bear agent** — builds the strongest possible short case from the same data
- **Judge agent** — reads both arguments, scores the debate, assigns a conviction score (0–100), and gives a final verdict (Buy/Hold/Sell) with position sizing guidance

This is how quant funds surface risks the primary analyst missed and quantify uncertainty.

### Tools available to the AI
| Tool | What it fetches |
|---|---|
| `get_price_data` | Current price, daily change, volume, 52w range |
| `get_reversal_analysis` | Proprietary reversal signals + strength score |
| `get_options_analysis` | Greeks, IV rank, max pain, P/C ratio, unusual activity |
| `get_fundamentals` | PE, EV/EBITDA, revenue growth, analyst targets |
| `get_insider_activity` | Recent insider buys/sells from SEC filings |
| `get_news_sentiment` | Latest headlines with positive/negative/neutral scoring |

### Model
`llama-3.3-70b-versatile` — Groq's best general-purpose model. 128K context window, strong reasoning, fast (~500 tokens/sec).

### Provider abstraction
The system auto-detects which key is set (`GROQ_API_KEY` vs `ANTHROPIC_API_KEY`). If you add an Anthropic key later, it switches to Claude automatically with no code changes. The abstraction lives in `backend/core/llm.py`.

---

## Supabase — The Persistent Memory Layer

### What it is
Supabase is a hosted PostgreSQL database with a REST API. We use it as a drop-in replacement for the original in-memory Python dict cache — except data now survives restarts, is accessible across processes, and can be queried with SQL.

### Tables

#### `cache`
**Purpose:** Replaces the in-memory `cache.py` dict.

Every expensive API call (yfinance data, options chain, fundamentals) is cached here with a TTL. When the backend restarts via PM2, the cache is already warm — no cold-start lag.

```
key          text  PRIMARY KEY   -- e.g. "price_AAPL", "options_TSLA_1mo"
value        jsonb               -- the cached response
created_at   timestamptz         -- used to enforce TTL on read
```

TTLs by data type:
- Price data: 2 minutes
- Options chain: 3 minutes
- Scanner results: 30 minutes
- Fundamentals: 24 hours

#### `chat_sessions`
**Purpose:** Persists research chat history across page refreshes and server restarts.

When you close the browser mid-conversation and come back, your AAPL research thread is still there. Sessions are indexed by ticker so you can see all conversations for a stock.

```
id           uuid  PRIMARY KEY
ticker       text              -- e.g. "AAPL"
title        text              -- auto-generated from first message
messages     jsonb             -- full conversation history
created_at   timestamptz
updated_at   timestamptz
```

#### `scan_results`
**Purpose:** Stores every Top 20 scanner run so you can track how signals shift over time.

The scanner runs across 83 stocks and scores each one for bullish/bearish options signals. Results are saved here by timeframe (1w, 1mo, 3mo, 6mo, 1y). You can query this table to see which stocks have been consistently bullish over multiple scans.

```
id           uuid  PRIMARY KEY
timeframe    text              -- "1w" | "1mo" | "3mo" | "6mo" | "1y"
bullish      jsonb             -- array of top 20 bullish stocks with scores
bearish      jsonb             -- array of top 20 bearish stocks with scores
scanned      integer           -- how many stocks were evaluated
scanned_at   timestamptz
```

#### `news_embeddings`
**Purpose:** Future RAG (Retrieval-Augmented Generation) pipeline.

When this is wired up, every news headline fetched for any stock gets embedded into a 384-dimensional vector and stored here. This enables semantic search across your entire news history — e.g., ask *"what has been written about NVDA supply chain risks?"* and get the most relevant headlines even if they don't contain those exact words.

```
id           uuid  PRIMARY KEY
ticker       text
headline     text
summary      text
source       text
sentiment    text              -- "positive" | "negative" | "neutral"
embedding    vector(384)       -- all-MiniLM-L6-v2 embedding
published_at timestamptz
created_at   timestamptz
```

---

## How They Work Together

```
User asks: "What's the outlook for TSLA?"
         │
         ▼
  FastAPI /ai_agent/research
         │
         ▼
  llm.run_loop() via Groq
  ┌──────────────────────────────┐
  │  AI decides: call 4 tools    │
  │  → get_price_data            │
  │  → get_options_analysis      │  ← each tool checks Supabase cache first
  │  → get_fundamentals          │    if stale/missing → fetches live → saves to Supabase
  │  → get_news_sentiment        │
  └──────────────────────────────┘
         │
         ▼
  AI synthesises all tool results
         │
         ▼
  Research note returned to user
  (conversation saved to chat_sessions)
```

The first request for any ticker fetches live data. Every subsequent request within the TTL window is served instantly from the Supabase cache — no API calls, no latency.

---

## What's Next

| Feature | Status | Notes |
|---|---|---|
| Groq AI summary | **Live** | `POST /api/v1/ai_agent/summary` |
| Groq research agent | **Live** | `POST /api/v1/ai_agent/research` |
| Groq chat | **Live** | `POST /api/v1/ai_agent/chat` |
| Bull vs Bear debate | **Live** | `POST /api/v1/ai_agent/debate` |
| Supabase cache | **Live** | Replaces in-memory dict, survives restarts |
| Chat session persistence | **Schema ready** | Wire up chat UI to save/load from `chat_sessions` |
| Scanner history | **Schema ready** | Save Top 20 runs to `scan_results`, add trend view |
| News embeddings / RAG | **Schema ready** | Needs embedding pipeline (sentence-transformers) |
| Morning briefing agent | **Planned** | APScheduler at 9:30am, AI summary of watchlist |
| Options AI summary | **Planned** | Wire `AISummaryStub` in `OptionsOverview.jsx` to `/summary` |
