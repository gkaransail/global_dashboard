# Coming Soon Features

These six modules are in development and appear in the dashboard with "Coming Soon" placeholders and early-access waitlists. Below is the planned architecture and roadmap for each.

---

## 1. Technical Analysis

**Route**: `#/technical/*`  
**Sub-tabs**: Chart Patterns · Screener · Support/Resistance · Indicators

### What It Will Do

Go beyond the reversal signal aggregator to give traders a full technical toolkit:

- **Chart Patterns**: Automatically detect classic patterns on the price chart — head & shoulders, double tops/bottoms, triangles, flags, wedges. Each pattern has a measured move target and failure invalidation level.
- **Screener**: Filter the entire US market by technical conditions (RSI < 30, golden cross in last 5 days, Bollinger squeeze active, etc.). Returns a ranked list of candidates.
- **Support/Resistance**: Auto-identify key price levels from volume profile, pivot points, and historical consolidation zones. Visualized as horizontal lines on the chart.
- **Indicators**: Interactive chart with any combination of SMA/EMA, RSI, MACD, Bollinger Bands, VWAP, ATR, Stochastic.

### Planned Architecture

```
backend/features/technical/
  ├── router.py
  ├── patterns/
  │   ├── detector.py     # Pattern detection algorithms (peak/trough analysis)
  │   └── models.py       # Pattern schema (type, start, end, target, invalidation)
  ├── screener.py         # Batch OHLCV fetch + filter engine
  └── levels.py           # Support/resistance from volume profile
```

### How to Learn Technical Analysis

Technical analysis is the study of price charts to forecast future price direction. The core idea: price and volume already contain all available information (the "efficient market" debate aside), and human psychology creates recognizable patterns that repeat.

**Key concepts to study:**
- **Dow Theory**: The foundation — trend identification, higher highs / lower lows, volume confirmation
- **Candlestick patterns**: Doji, hammer, engulfing, morning/evening star — each tells a story about buyer/seller balance in a single session
- **Chart patterns**: Continuation patterns (flags, pennants, triangles) vs reversal patterns (head & shoulders, double tops)
- **Moving averages**: Trend identification and dynamic support/resistance
- **Volume**: The "truth serum" — a price move on high volume is more credible than the same move on low volume

**Recommended resources:**
- *Technical Analysis of the Financial Markets* — John Murphy (the definitive textbook)
- *Japanese Candlestick Charting Techniques* — Steve Nison
- TradingView's public scripts library (thousands of community indicators with open source code)

---

## 2. Fundamental Analysis

**Route**: `#/fundamental/*`  
**Sub-tabs**: Valuation · Growth Score · Quality Score · Screener

### What It Will Do

Analyze a company's financial health and intrinsic value, not just its price chart.

- **Valuation**: P/E, P/B, P/S, EV/EBITDA ratios compared to sector medians and 5-year history. DCF model with adjustable growth assumptions. Graham Number (fair value floor).
- **Growth Score**: Revenue growth rate, earnings growth rate, gross margin expansion, FCF growth — scored 0–100 vs sector peers.
- **Quality Score**: Return on equity (ROE), return on invested capital (ROIC), debt/equity, current ratio, Piotroski F-Score, Altman Z-Score for bankruptcy risk.
- **Screener**: Filter all US stocks by any combination of fundamental metrics.

### Planned Data Sources

yfinance provides most financial statement data (income statement, balance sheet, cash flow) for free:
- `ticker.financials` — income statement (annual + quarterly)
- `ticker.balance_sheet` — balance sheet
- `ticker.cashflow` — cash flow statement
- `ticker.info` — PE ratio, market cap, sector, forward estimates

For deeper fundamental data (10-K/10-Q parsing, earnings estimates, analyst ratings), integration with SEC EDGAR API (free) or Financial Modeling Prep API (freemium) is planned.

### How to Learn Fundamental Analysis

Fundamental analysis answers: "Is this company worth owning at this price?"

**Key concepts:**
- **Intrinsic value vs market price**: The gap between what something is worth (intrinsic) and what it trades for (market price) is where opportunity lives
- **Earnings power**: Revenue growth × margin expansion × multiple = stock price. If two of these three improve, the stock likely goes up.
- **Balance sheet strength**: Companies with strong balance sheets survive recessions; weak ones get wiped out
- **Moat**: Warren Buffett's concept — a durable competitive advantage that protects profit margins over time

**Recommended resources:**
- *The Intelligent Investor* — Benjamin Graham (foundation of value investing)
- *Security Analysis* — Graham & Dodd (the academic foundation)
- *One Up on Wall Street* — Peter Lynch (growth investing from a practical perspective)
- *Financial Shenanigans* — Howard Schilit (learn how companies manipulate earnings)

---

## 3. Insider Trading

**Route**: `#/insider/*`  
**Sub-tabs**: Transaction Feed · Cluster Buys

### What It Will Do

Track SEC Form 4 filings — mandatory disclosures when company executives, directors, or 10%+ shareholders buy or sell their own company's stock.

- **Transaction Feed**: Real-time stream of all insider transactions — who bought/sold, how many shares, at what price, what their role is (CEO/CFO/Director/etc.)
- **Cluster Buys**: The most actionable signal — when multiple insiders at the same company buy within a short window. Statistically, cluster buying by 3+ insiders has historically outperformed the market significantly.

### Why Insider Activity Matters

Insiders know their company better than anyone. They know if a new product is working, if a deal is closing, if earnings will beat expectations — or the opposite. When they buy their own stock with their own money at market prices (Form 4 purchases, not options grants), it's a meaningful signal of confidence.

**What to look for:**
- **Open market purchases** (most bullish) vs options exercises (less meaningful)
- **Purchase size**: A CEO buying $10M of stock is more significant than buying $10k
- **Cluster buying**: Multiple insiders buying within 30 days of each other
- **Recent seller who starts buying**: An insider who sold for years suddenly buying is a major signal

**What to ignore:**
- **Automatic selling programs (10b5-1 plans)**: Pre-scheduled sales for diversification — not a negative signal
- **Options exercises followed by immediate sale**: Tax-driven, not indicative of conviction
- **Small gift/inheritance transactions**: Administrative, not investment-driven

### Planned Architecture

```
backend/features/insider/
  ├── router.py
  ├── fetcher.py      # SEC EDGAR Form 4 XBRL API (free, no key needed)
  ├── parser.py       # Extract transaction type, shares, price, insider role
  └── cluster.py      # Detect and score cluster buy patterns
```

**Data source**: SEC EDGAR full-text search API (`efts.sec.gov`) — free, no API key required. Form 4s are filed within 2 business days of a transaction.

---

## 4. Smart Money Flow

**Route**: `#/smart_money/*`  
**Sub-tabs**: Institutional · Dark Pool · Options Flow

### What It Will Do

Track what large institutional investors are actually doing, not just saying.

- **Institutional (13F)**: Quarterly SEC filings where funds with >$100M AUM disclose all long equity positions. See what Berkshire Hathaway, Bridgewater, Tiger Global, Citadel are holding and what changed quarter-over-quarter.
- **Dark Pool**: Large institutional trades often execute off-exchange ("dark pools") to minimize market impact. These trades show up in FINRA reporting with a delay. High dark pool volume at a price level suggests institutional conviction.
- **Options Flow**: Real-time large options order flow — "whales" placing six-figure+ premium bets. Different from Unusual Activity: this focuses specifically on large single transactions, not the Vol/OI ratio.

### Why Smart Money Flow Matters

Institutional investors manage trillions of dollars. When they move into or out of a stock, it creates persistent price trends. Following their positioning (even with the 45-day 13F delay) gives insight into where informed capital is concentrating.

**The 13F edge:**
- 13Fs are public and free (SEC EDGAR)
- The 45-day delay reduces some edge, but position changes in large-cap stocks still provide useful signal
- "Aggregated crowding" — many funds piling into the same names creates herding risk when they all exit

**Dark pool context:**
- ~40% of US equity volume now trades off-exchange
- Large dark pool prints at a specific price level can signal institutional accumulation
- When dark pool volume is high and price barely moves, it often indicates someone absorbing shares quietly (Wyckoff accumulation)

### Planned Architecture

```
backend/features/smart_money/
  ├── router.py
  ├── thirteenf.py    # Parse 13F XML from SEC EDGAR
  ├── darkpool.py     # FINRA dark pool volume from finra.org API (free)
  └── flow.py         # Large options order filter (>$500k premium threshold)
```

---

## 5. Sentiment Analysis

**Route**: `#/sentiment/*`  
**Sub-tabs**: Fear & Greed · News Sentiment · Social Signals

### What It Will Do

Quantify investor psychology from news and social media to identify sentiment extremes.

- **Fear & Greed Index**: Full composite index similar to CNN's — VIX level, market momentum, safe haven demand, put/call ratio, junk bond demand, stock price breadth, market volatility. Gives a 0–100 score updated daily.
- **News Sentiment**: NLP-scored news headlines from financial news sources. Aggregate sentiment across the last 24 hours, 7 days, 30 days. Track sentiment trend (improving/deteriorating).
- **Social Signals**: Reddit (WallStreetBets, stocks subreddits) and StockTwits mention volume and sentiment. A surge in mentions + negative sentiment = potential capitulation. A surge in mentions + positive sentiment for a small-cap = meme stock momentum.

### Why Sentiment Matters

Markets are driven by human psychology as much as fundamentals. Sentiment extremes are contrarian signals:

- **Extreme fear** → Everyone who wants to sell has already sold. Remaining sellers are few. Buyers step in. Markets bottom at maximum fear.
- **Extreme greed** → Buyers are all in. There's no one left to buy. Markets top at maximum euphoria.

The challenge is timing: markets can stay irrational longer than most people expect. Sentiment tools work best as a risk management layer, not a timing signal on their own.

### Planned Architecture

```
backend/features/sentiment/
  ├── router.py
  ├── fear_greed.py     # Composite score from public macro data
  ├── news.py           # NewsAPI (free tier) + transformers sentiment model
  └── social.py         # Reddit API (free) + StockTwits API (free)
```

**NLP approach**: For news sentiment, plan to use a pre-trained FinBERT model (BERT fine-tuned on financial text) via the Hugging Face `transformers` library. This runs locally — no API cost, and financial domain language is handled much better than general-purpose sentiment models.

---

## 6. AI Research Agent

**Route**: `#/ai_agent/*`  
**Sub-tabs**: AI Summary · Deep Research · Research Chat

### What It Will Do

This is the flagship planned feature — a multi-agent AI assistant powered by the Claude API that can synthesize all of the platform's data sources into natural language research.

- **AI Summary**: One-click generation of a 3-paragraph research brief on any ticker. Synthesizes reversal signals + options positioning + macro environment + sector context into a coherent narrative.
- **Deep Research**: Given a ticker and a research question ("Is this company's revenue growth sustainable?"), the agent autonomously fetches financial statements, reads recent news, examines technical setup, and writes a structured research report.
- **Research Chat**: Interactive conversation with an AI analyst. Ask follow-up questions, request specific comparisons, or drill into any aspect of the analysis. The agent has access to all platform tools.

### Planned Architecture

```
backend/features/ai_agent/
  ├── router.py
  ├── tools.py          # Tool definitions for the agent (fetch_analysis, fetch_chain, etc.)
  └── agent.py          # Claude API client + agent loop
```

**Claude API integration pattern (already stubbed in OptionsOverview.jsx):**

```python
# POST /api/v1/ai/options-summary
import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

def generate_options_summary(ticker: str, snapshot: dict) -> dict:
    response = client.messages.create(
        model="claude-opus-4-7",  # or claude-sonnet-4-6 for faster/cheaper
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": f"""Analyze this options data for {ticker} and give a concise summary.
            
Data: {json.dumps(snapshot, indent=2)}

Return JSON with: headline (1 sentence), bullets (3 key observations), sentiment (bullish/bearish/neutral)."""
        }]
    )
    return json.loads(response.content[0].text)
```

**Multi-agent design for Deep Research:**

The deep research feature will use Claude's tool_use capability to build a research loop:

1. User asks: "Is NVDA overvalued at current prices?"
2. Agent plans: needs valuation data, earnings estimates, technical setup, macro context
3. Agent calls tools: `get_fundamentals("NVDA")`, `get_reversal_analysis("NVDA")`, `get_options_analysis("NVDA")`
4. Agent synthesizes: reads all tool outputs and writes a structured answer
5. User can follow up: "What would make you change this view?"

This pattern (plan → gather → synthesize → respond) is what separates an AI research agent from a simple Q&A chatbot.

---

## Development Roadmap

| Feature | Priority | Estimated Complexity | Key Dependency |
|---------|----------|---------------------|---------------|
| Technical Analysis | High | Medium | Chart library (Recharts/TradingView) |
| Fundamental Analysis | High | Medium | yfinance financials + SEC EDGAR |
| Sentiment Analysis | Medium | High | NLP model hosting (FinBERT) |
| Insider Trading | Medium | Low | SEC EDGAR Form 4 API (free) |
| Smart Money Flow | Low | High | FINRA dark pool data, 13F parsing |
| AI Research Agent | High | Medium | Anthropic API key |

The AI Research Agent has **medium** complexity because the tool infrastructure already exists in the platform — the agent just needs to call those APIs and synthesize. The hardest part is prompt engineering for financial analysis quality.

---

## Early Access

Each Coming Soon page has a "Get Early Access" button. When users click it, they can leave their email. The current implementation shows an `alert()` — the production version will:

1. `POST` to `/api/v1/waitlist` with `{ email, feature_id }`
2. Backend stores in a database (SQLite → PostgreSQL in prod)
3. Automated email confirmation via SendGrid or Resend
4. Users get notified when their requested feature launches
