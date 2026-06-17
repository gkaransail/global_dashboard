# AI Research Agent — User Guide

## What does it do?
An AI assistant that can research any stock by actually reading the options data, reversal signals, fundamentals, news sentiment, and insider activity — then synthesizing everything into plain English. Unlike a generic chatbot, it has direct access to all the dashboard's live data.

## Setup Required
The AI agent needs an API key to function. Add one to `backend/.env`:
- **Groq** (free tier, fast): `GROQ_API_KEY=gsk_...` — get one at groq.com
- **Anthropic** (Claude, paid): `ANTHROPIC_API_KEY=sk-ant-...`

Restart the backend after adding the key.

## Tabs

### AI Summary
The quickest option. One click and the AI gathers price data, options signals, reversal scores, and fundamentals, then writes a 2–4 paragraph market note covering:
- What's happening with the stock right now
- What the options market is saying
- Key risks and opportunities
- Current signals direction (bullish/bearish/neutral)

**Best for:** Quick pre-market briefing on a stock, or when you want a plain-English synthesis instead of reading raw numbers.

### Deep Research
You ask a specific question and the AI goes to work — it decides which data sources to consult, fetches them, and synthesizes a detailed answer. Examples:
- "Why is the IV rank so high for NVDA right now?"
- "What are the biggest risks heading into earnings?"
- "Is the options market pricing in more risk than fundamentals justify?"
- "Summarize the insider activity and what it suggests"

The AI uses multiple tools in sequence — it's not just one API call. It researches before it answers.

**Best for:** Specific questions where you need a researched answer, not just raw data.

### Research Chat
An interactive conversation about the stock. The AI remembers the full conversation history within the session and can ask clarifying questions, build on previous answers, and dig deeper as you follow up.

**Best for:** Exploratory research sessions where you're forming a view and want to pressure-test it.

### Bull vs Bear
The AI plays both sides simultaneously:
- **Bull case** — The strongest argument for why the stock goes up
- **Bear case** — The strongest argument for why it goes down
- **Neutral summary** — What the key deciding factors are

**Best for:** Challenging your own bias. If you're already bullish, read the bear case carefully.

## Tips
- The AI has access to live data — it will tell you actual current P/C ratios, IV rank, insider activity, etc.
- For the best Deep Research answers, be specific: "What does the current GEX environment mean for near-term price action?" is better than "Tell me about AAPL."
- The AI can be wrong — always verify important claims against the raw data in other tabs.
- Research Chat is stateless — each new tab load starts fresh. The AI doesn't remember previous conversations.
