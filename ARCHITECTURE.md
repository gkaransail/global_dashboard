# FinanceIQ — Architecture & Model Reference

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Layout](#2-directory-layout)
3. [Runtime Architecture](#3-runtime-architecture)
4. [Feature Auto-Discovery](#4-feature-auto-discovery)
5. [Core Infrastructure](#5-core-infrastructure)
6. [Feature Modules — Backend](#6-feature-modules--backend)
   - [Reversal Scanner](#61-reversal-scanner)
   - [Options Analysis](#62-options-analysis)
   - [Earnings Calendar](#63-earnings-calendar)
   - [Technical Analysis](#64-technical-analysis)
   - [Fundamental Analysis](#65-fundamental-analysis)
   - [Market Sentiment](#66-market-sentiment)
   - [Insider Tracker](#67-insider-tracker)
   - [Smart Money Scanner](#68-smart-money-scanner)
   - [Market Intelligence](#69-market-intelligence)
   - [Congress Tracker](#610-congress-tracker)
   - [13F Institutional Holdings](#611-13f-institutional-holdings)
   - [Portfolio Tracker](#612-portfolio-tracker)
   - [Alerts & Watchlist](#613-alerts--watchlist)
   - [AI Research Agent](#614-ai-research-agent)
7. [Signal Model — How Scores Are Computed](#7-signal-model--how-scores-are-computed)
8. [Frontend Architecture](#8-frontend-architecture)
9. [API Reference](#9-api-reference)
10. [Data Sources & Caching](#10-data-sources--caching)
11. [Scaling Notes](#11-scaling-notes)

---

## 1. System Overview

FinanceIQ is a full-stack financial intelligence dashboard designed to surface institutional-grade signals — options flow, insider activity, congressional trades, reversal patterns, and fundamental health — in a single unified interface.

**Stack:**
- **Backend:** Python 3.14 · FastAPI · uvicorn · yfinance · pandas · numpy
- **Frontend:** React 18 · Vite · React Router · Zustand
- **Storage:** In-memory TTL cache (backend) · JSON files (portfolio, alerts, watchlist)
- **Data:** Yahoo Finance (live, via yfinance) · SEC EDGAR (via yfinance wrappers) · Congress S3 (STOCK Act disclosures)

**Design principles:**
- Every feature is a self-contained module — `manifest.py` + `router.py` + analyzer files
- The registry auto-discovers and mounts modules; `main.py` never changes when adding features
- All heavy computation runs synchronously in FastAPI route handlers (no async I/O bottlenecks from yfinance's blocking HTTP calls)
- Frontend state lives in Zustand; components react to `ticker` + `timeframe` changes

---

## 2. Directory Layout

```
global_dashboard/
├── docker-compose.yml
├── ARCHITECTURE.md
├── README.md
│
├── backend/
│   ├── main.py                        # FastAPI app entry point
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── data/                          # Persistent JSON storage (portfolio, alerts, watchlist)
│   │   ├── portfolio.json
│   │   ├── alerts.json
│   │   └── watchlist.json
│   ├── core/
│   │   ├── config.py                  # Pydantic settings + feature flags
│   │   ├── cache.py                   # In-memory TTL cache (dict + timestamps)
│   │   ├── exceptions.py              # AppException + handlers
│   │   ├── response.py                # Shared response helpers
│   │   └── data/
│   │       └── fetcher.py             # Shared yfinance layer — OHLCV, macro, sectors
│   └── features/
│       ├── registry.py                # Auto-discovery: scans dirs, mounts routers
│       ├── reversal/                  # Multi-factor reversal signal engine
│       ├── options/                   # Options chain, Greeks, IV skew, unusual activity
│       ├── earnings/                  # Earnings calendar + EPS surprise analysis
│       ├── technical/                 # Chart indicators, patterns, support/resistance
│       ├── fundamental/               # Valuation, growth score, quality score, screener
│       ├── sentiment/                 # Fear & Greed index (7-factor composite)
│       ├── insider/                   # SEC Form 4 insider transactions + cluster detection
│       ├── smart_money/               # Options + insider + institutional composite scanner
│       ├── market_intel/              # Multi-horizon ranked picks (1W / 1M / 3M)
│       ├── congress/                  # STOCK Act congressional trading disclosures
│       ├── institutional/             # 13F holdings, fund flow, screener
│       ├── portfolio/                 # Position tracking + live P&L
│       ├── alerts/                    # Price + signal alerts, watchlist
│       ├── ai_agent/                  # Claude-powered research agent (tool use)
│       └── health/                    # Platform health check
│
└── frontend/
    ├── Dockerfile
    ├── vite.config.js                 # Dev proxy: /api → :8000, /ws → ws://:8000
    ├── index.html
    └── src/
        ├── main.jsx                   # React root + BrowserRouter
        ├── App.jsx                    # Layout shell + top-level routes
        ├── index.css                  # Design system (CSS variables, dark theme)
        ├── core/
        │   ├── api.js                 # Thin fetch wrapper for /api/v1/*
        │   └── store.js               # Zustand store: ticker, timeframe, watchlist
        ├── components/
        │   ├── Sidebar.jsx            # 2-level nav (feature → sub-option)
        │   └── TickerBar.jsx          # Ticker input, timeframe pills, live quote
        └── features/
            ├── index.js               # Frontend FEATURES registry (mirrors backend manifests)
            ├── LandingPage.jsx
            ├── MarketHub.jsx
            ├── reversal/
            ├── options/
            ├── earnings/
            ├── technical/
            ├── fundamental/
            ├── sentiment/
            ├── insider/
            ├── smart_money/
            ├── market_intel/
            ├── congress/
            ├── institutional/
            ├── portfolio/
            ├── alerts/
            └── ai_agent/
```

---

## 3. Runtime Architecture

```
Browser (localhost:5173)
        │
        │  fetch /api/v1/*
        ▼
Vite Dev Server ──── proxy ────► FastAPI (localhost:8000)
                                       │
                                  Feature Registry
                                  (auto-discovered)
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                         │
         reversal/               options/                 smart_money/
         router.py               router.py                 scanner.py
              │                        │                         │
         4 Signal               4 Analyzers                3 Signal
         Analyzers              (chain, analysis,           Modules
         (technical,             unusual, skew)             (options,
          macro,                      │                      insider,
          breadth,             yfinance                      institution)
          sentiment)           option_chain()                     │
              │                        │                  ThreadPoolExecutor
         composite.py          Black-Scholes                (concurrent)
              │                 (pure math)                       │
              └────────────────────────┴─────────────────────────┘
                                       │
                            In-Memory TTL Cache
                              (core/cache.py)
                                       │
                               yfinance layer
                              (core/data/fetcher.py)
                                       │
                          Yahoo Finance API  ·  SEC EDGAR
                          Congress S3  ·  Anthropic API (AI Agent)
```

---

## 4. Feature Auto-Discovery

The registry scans `backend/features/` at startup and mounts any directory containing both `manifest.py` and `router.py`:

```python
# registry.py
def discover(features_dir: Path):
    for subdir in features_dir.iterdir():
        if (subdir / 'manifest.py').exists() and (subdir / 'router.py').exists():
            manifest = importlib.import_module(f'features.{subdir.name}.manifest').MANIFEST
            router   = importlib.import_module(f'features.{subdir.name}.router').router
            _registry.append((manifest, router))

def mount_all(app, prefix):
    for manifest, router in _registry:
        app.include_router(router, prefix=f"{prefix}/{manifest['id']}")
```

**Adding a new feature requires zero changes to `main.py`** — just create the two files.

Each `manifest.py` exports a `MANIFEST` dict:
```python
MANIFEST = {
    "id":          "my_feature",       # URL prefix + frontend route key
    "label":       "My Feature",
    "icon":        "📊",
    "description": "...",
    "status":      "live",             # or "coming_soon"
    "api_prefix":  "/api/v1/my_feature",
    "sub_options": [{"id": "...", "label": "...", "icon": "..."}],
}
```

---

## 5. Core Infrastructure

### Config (`core/config.py`)

Pydantic `BaseSettings` — reads from `.env` file, environment, or defaults:

| Setting | Default | Purpose |
|---------|---------|---------|
| `api_prefix` | `/api/v1` | All route prefixes |
| `data_cache_ttl` | `300s` | OHLCV + price data |
| `signal_cache_ttl` | `60s` | Computed signal results |
| `reversal_confidence_threshold` | `0.55` | Minimum confidence for a signal to be actionable |
| `strong_signal_threshold` | `0.75` | Threshold for STRONG strength label |
| `anthropic_api_key` | `""` | Required only for AI Agent feature |

**Feature flags** (`FEATURE_FLAGS` dict): set any feature to `"pro"` to gate it behind a subscription tier check. All features default to `"free"`.

### Cache (`core/cache.py`)

In-process dict with timestamps. Thread-safe for single-worker deployment.

```python
_store: dict[str, tuple[Any, float]] = {}   # key → (value, set_timestamp)

def get(key, ttl) → value | None
def set(key, value) → None
def invalidate(key) → None
```

**Important:** With multiple uvicorn workers (`--workers N`), each worker has its own independent cache. This multiplies outbound Yahoo Finance calls by N. Switch to Redis before adding workers.

### Data Fetcher (`core/data/fetcher.py`)

Shared yfinance wrapper used by every feature module. Caches all results for 5 minutes.

```python
fetch_ohlcv(ticker, period, interval)   → pd.DataFrame | None
fetch_multiple(tickers, period)         → dict[str, DataFrame]
fetch_macro_data(period)                → dict[str, DataFrame]   # 8 macro assets
fetch_sector_data(period)               → dict[str, DataFrame]   # 11 sector ETFs

MACRO_TICKERS = {
    "gold": "GC=F",  "dxy": "DX-Y.NYB",  "vix": "^VIX",
    "oil":  "CL=F",  "tnx": "^TNX",       "copper": "HG=F",
    "sp500": "^GSPC", "qqq": "QQQ",
}
SECTOR_ETFS = {
    "XLK": "Technology",  "XLF": "Financials",  "XLE": "Energy",
    "XLV": "Healthcare",  "XLI": "Industrials",  "XLY": "Consumer Disc.",
    "XLP": "Consumer Staples",  "XLU": "Utilities",  "XLRE": "Real Estate",
    "XLB": "Materials",  "XLC": "Communication",
}
```

---

## 6. Feature Modules — Backend

### 6.1 Reversal Scanner

**Path:** `backend/features/reversal/`
**API prefix:** `/api/v1/reversal`
**Cache TTL:** signals 60s, data 300s

The core signal engine. Combines 4 independent analyzers into a single directional verdict with confidence score.

#### Signal Categories

| Analyzer | Weight | Signals | Key Inputs |
|----------|--------|---------|------------|
| `technical.py` | **35%** | 8 | RSI, MACD, Bollinger Bands, 20/50/200 MA crossovers, volume divergence |
| `macro.py` | **30%** | 7 | Gold, DXY, VIX, crude oil, 10Y Treasury, copper, S&P500 momentum |
| `breadth.py` | **20%** | 4 | Sector rotation (11 ETFs), breadth thrust, relative strength, 52W hi/lo proxy |
| `sentiment.py` | **15%** | 4 | VIX vs 50MA fear/greed, S&P momentum, Wyckoff accumulation, price gap analysis |

#### Scoring Pipeline

```
1. Each signal analyzer returns: List[IndividualSignal]
   Each signal has:
     direction:  BULLISH (+1) | BEARISH (-1) | NEUTRAL (0)
     strength:   STRONG (1.0) | MODERATE (0.6) | WEAK (0.3)
     score:      direction × strength  →  range [-1, +1]

2. Per-category score:
     category_score = mean(signal.score for signal in category)

3. Composite score:
     composite = 0.35×technical + 0.30×macro + 0.20×breadth + 0.15×sentiment
     composite ∈ [-1, +1]

4. Direction:
     composite > +0.08  → BULLISH
     composite < -0.08  → BEARISH
     else               → NEUTRAL

5. Confidence = abs(composite)  ∈ [0, 1]
   Strength:
     confidence ≥ 0.70  → STRONG
     confidence ≥ 0.45  → MODERATE
     else               → WEAK
```

#### Endpoints

```
GET  /analyze/{ticker}?explain=true&lookback_days=90
POST /analyze            body: {ticker, explain, categories, lookback_days}
POST /watchlist          body: {tickers: [...], explain: bool}
GET  /signals/{ticker}
GET  /sectors            (scans all 11 sector ETFs)
GET  /macro              (7 macro assets snapshot)
```

---

### 6.2 Options Analysis

**Path:** `backend/features/options/`
**API prefix:** `/api/v1/options`

#### IV Rank & Percentile

Added to `/analysis/{ticker}` response. Uses 21-day rolling historical volatility as a proxy for implied volatility over a 1-year window:

```
HV_series = rolling(21-day) std(log_returns) × sqrt(252)
  over past 1 year of daily OHLCV data

IV_Rank       = (current_IV − HV_52w_low) / (HV_52w_high − HV_52w_low) × 100
IV_Percentile = % of trading days in past year where HV < current_IV

Interpretation:
  IV Rank  0–20  → Very low IV, options are cheap (premium sellers beware)
  IV Rank 20–40  → Below average IV
  IV Rank 40–60  → Average IV
  IV Rank 60–80  → Elevated IV, options are expensive
  IV Rank 80–100 → Very high IV, extreme premium environment
```

#### Black-Scholes Greeks

Computed without `scipy` (pure `math.erf`):

```
d1 = (ln(S/K) + (r + σ²/2)×T) / (σ × sqrt(T))
d2 = d1 − σ × sqrt(T)

Delta (call) = N(d1)
Delta (put)  = N(d1) − 1
Gamma        = N'(d1) / (S × σ × sqrt(T))
Theta        = −(S × N'(d1) × σ) / (2 × sqrt(T)) − r × K × e^(−rT) × N(d2)
Vega         = S × N'(d1) × sqrt(T)     [per 1% IV move → divide by 100]

r = 0.05 (risk-free rate, hardcoded)
```

#### Expected Move (1σ)

```
move_dollar = spot × ATM_IV × sqrt(DTE / 365)
move_pct    = ATM_IV × sqrt(DTE / 365) × 100
Range: [spot − move_dollar, spot + move_dollar]
```

#### Max Pain

```
For each candidate strike S:
  call_pain(S) = Σ max(0, S − K) × OI_call(K)   for all K
  put_pain(S)  = Σ max(0, K − S) × OI_put(K)    for all K
  total_pain   = call_pain + put_pain

Max pain strike = argmin total_pain
```

#### Unusual Activity Score

```
vol_oi_score  = min(volume / open_interest / 10,  1.0)
premium_score = min(log10(mid_price × volume × 100) / 7, 1.0)
iv_score      = min((IV − 0.50) / 1.5, 1.0) if IV > 0.50 else 0

score = vol_oi_score×0.40 + premium_score×0.40 + iv_score×0.20
```

---

### 6.3 Earnings Calendar

**Path:** `backend/features/earnings/`
**API prefix:** `/api/v1/earnings`

Fetches upcoming earnings dates and computes expected move vs historical move to identify mispriced options:

```
Pricing signal:
  expected_move  = ATM_IV × sqrt(DTE/365)          (same formula as options)
  historical_avg = mean(abs(price_reaction) for last 8 earnings)

  expected_move > historical_avg × 1.2  → "overpriced"  (sell premium)
  expected_move < historical_avg × 0.8  → "underpriced" (buy premium)
  else                                  → "fairly priced"

Beat rate = count(EPS_actual > EPS_estimate) / 8
```

Default watchlist: AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, JPM, V, MA, JNJ, UNH, XOM, HD, COST

---

### 6.4 Technical Analysis

**Path:** `backend/features/technical/`
**API prefix:** `/api/v1/technical`

All indicators computed from OHLCV using pure pandas/numpy:

| Indicator | Parameters | Formula |
|-----------|-----------|---------|
| RSI | 14-period | Wilder's RSI via EWM (α = 1/14) |
| MACD | 12/26 EMA, 9 signal | Fast EMA − Slow EMA; Signal = EMA(MACD, 9) |
| Bollinger Bands | 20-period, ±2σ | SMA(20) ± 2 × std(20) |
| EMA | 20 / 50 / 200 | Exponential weighted mean |
| Stochastic | %K=14, %D=3 | %K = (C−Low14)/(High14−Low14)×100; %D = SMA(%K,3) |
| ATR | 14-period | Mean of True Range over 14 periods |
| VWAP | 20-period rolling | Σ(price × volume) / Σ(volume) |

**Screener verdicts** (`/technical/screener`): scores each of 50 stocks by combining RSI, MACD signal, MA alignment, and Bollinger Band position into a bullish/bearish/neutral call.

---

### 6.5 Fundamental Analysis

**Path:** `backend/features/fundamental/`
**API prefix:** `/api/v1/fundamental`

#### Valuation

| Metric | Formula |
|--------|---------|
| Graham Number | `sqrt(22.5 × EPS × BVPS)` |
| DCF Estimate | 5-year DCF: 10% discount rate, 5% initial growth, 3% terminal — range ±20% |
| Price-to-Value | current price vs DCF range → overvalued / fair / undervalued |

#### Growth Score (0–100)

Weighted composite of 6 metrics with hardcoded thresholds:

| Metric | Weight | Score Breakpoints |
|--------|--------|-------------------|
| Revenue YoY | 20% | >20%→100, >10%→80, >5%→60, >0%→40, else→20 |
| Revenue 3Y CAGR | 20% | same scale |
| Earnings YoY | 20% | >25%→100, >10%→80, >0%→60, >−10%→30, else→0 |
| Gross Margin | 15% | >50%→100, >30%→75, >15%→50, else→25 |
| Operating Margin | 15% | >20%→100, >10%→70, >0%→40, else→10 |
| FCF Yield | 10% | >5%→100, >2%→70, >0%→50, else→20 |

#### Quality Score (0–100)

Altman Z-Score + Piotroski F-Score + return/leverage metrics:

```
Altman Z-Score (public companies):
  Z = 1.2×X1 + 1.4×X2 + 3.3×X3 + 0.6×X4 + 1.0×X5
  where:
    X1 = Working Capital / Total Assets
    X2 = Retained Earnings / Total Assets
    X3 = EBIT / Total Assets
    X4 = Market Cap / Total Liabilities
    X5 = Revenue / Total Assets
  Z > 2.99 → Safe Zone
  Z 1.81–2.99 → Grey Zone
  Z < 1.81 → Distress Zone

Piotroski F-Score (9 binary tests):
  Profitability (4): positive ROA, positive operating CF, increasing ROA, accruals < 0
  Leverage (3): decreasing long-term debt ratio, increasing current ratio, no share dilution
  Operating (2): increasing gross margin, increasing asset turnover
  Score 8–9 = strong, 4–7 = moderate, 0–3 = weak

Screener verdict:
  PE < 15 AND ROE > 15%  → Strong Buy
  PE < 20 AND ROE > 10%  → Buy
  PE > 30               → Expensive
  ROE < 5%              → Weak Fundamentals
```

---

### 6.6 Market Sentiment

**Path:** `backend/features/sentiment/`
**API prefix:** `/api/v1/sentiment`
**Cache TTL:** 900s (15 min)

Fear & Greed Index — 7-factor composite mapped to 0–100:

| Indicator | Weight | Logic |
|-----------|--------|-------|
| VIX vs 50MA | 20% | VIX below MA → greed; VIX >30 → extreme fear |
| SPY 125-day momentum | 15% | +20% return → max greed; −20% → max fear |
| Put/Call Ratio | 20% | PCR <0.7 → greed; PCR >1.4 → fear |
| Safe Haven Demand | 15% | TLT vs SPY 20-day returns; bonds outperform → fear |
| Junk Bond Demand | 10% | HYG vs LQD; HYG outperforms → greed |
| Market Breadth | 10% | % of 11 sector ETFs above 200MA |
| Price Strength | 10% | % of sectors within 5% of 52W high |

```
Each indicator score: −1.0 (extreme fear) → +1.0 (extreme greed)
Composite = weighted mean of 7 scores
F&G Index = (composite + 1) / 2 × 100   →  0–100

Ranges:
  0–25   Extreme Fear
  25–45  Fear
  45–55  Neutral
  55–75  Greed
  75–100 Extreme Greed
```

---

### 6.7 Insider Tracker

**Path:** `backend/features/insider/`
**API prefix:** `/api/v1/insider`

#### Transaction Scoring

Source: yfinance `insider_transactions` (SEC Form 4 data)

```
Classification (by "Text" field):
  Buy  = text.contains("purchase")
  Sell = text.contains("sale") or "sold"
  Ignored: awards, grants, exercises, conversions

Net value score:
  value_ratio = (buy_value − sell_value) / (buy_value + sell_value)  ∈ [−1, +1]
  composite = value_ratio × 0.9
  +0.15 bonus if 3+ insiders bought and buy_value > sell_value
  −0.15 penalty if 5+ insiders sold and sell_value > 2 × buy_value
```

#### Cluster Detection

Detects coordinated insider buying within a rolling time window:

```
cluster_score = min(1.0, num_insiders × log(total_value) / 10)

A cluster is flagged when:
  - 2+ distinct insiders buy within the same 30-day rolling window
  - Purchases only (sells excluded from cluster logic)

Returns top cluster per ticker (highest score)
```

---

### 6.8 Smart Money Scanner

**Path:** `backend/features/smart_money/`
**API prefix:** `/api/v1/smart_money`
**Cache TTL:** 3600s (1 hour)

Composite of 3 signal categories across a universe of 62 liquid stocks:

#### Signal Weights

| Signal | Weight | Source |
|--------|--------|--------|
| Options Flow | **40%** | PCR, unusual activity, IV skew |
| Insider Activity | **35%** | Net buy/sell value (90-day lookback) |
| Institutional | **25%** | Ownership % + position change trend |

```
composite = options×0.40 + insider×0.35 + institution×0.25
composite ∈ [−1, +1]

Verdicts:
  ≥ +0.35  → Strong Buy
  ≥ +0.15  → Bullish
  ≤ −0.35  → Strong Sell
  ≤ −0.15  → Bearish
  else     → Neutral
```

#### Options Signal Breakdown

```
PCR score   (60% weight):
  PCR < 0.5   → +1.0  (heavy call buying)
  PCR < 0.7   → +0.6
  PCR < 0.9   → +0.2
  PCR < 1.1   → −0.1
  PCR < 1.4   → −0.5
  PCR ≥ 1.4   → −1.0  (heavy put buying)

Unusual activity score (25% weight):
  unusual_calls×0.15 − unusual_puts×0.15  (capped at ±0.4)
  Unusual = any strike where volume/OI > 3

Skew score (15% weight):
  skew = avg(OTM_put_IV) − avg(OTM_call_IV)
  skew > 0.15 → −0.4  (bearish skew)
  skew > 0.05 → −0.15
  skew < −0.05 → +0.15
```

#### Signal Conflict Detection

When two signals disagree in direction by ≥ 0.25 each, a conflict is flagged:

```python
CONFLICT_THRESHOLD = 0.25

conflicts detected when:
  abs(score_A) ≥ 0.25  AND
  abs(score_B) ≥ 0.25  AND
  sign(score_A) ≠ sign(score_B)

Pairs checked: options↔insider, options↔institution, insider↔institution
```

Conflicts surface as amber warning badges in the scanner UI — a composite score of +0.20 means less when options are bullish (+0.6) but insiders are selling (−0.4).

---

### 6.9 Market Intelligence

**Path:** `backend/features/market_intel/`
**API prefix:** `/api/v1/market_intel`
**Cache TTL:** 1800s (30 min)

Ranks 65 liquid stocks across 3 time horizons using horizon-specific signal weights:

| Horizon | Options | Reversal | Smart Money | Insider |
|---------|---------|---------|------------|---------|
| **1W** | 50% | 25% | 15% | 10% |
| **1M** | 40% | 30% | 20% | 10% |
| **3M** | 25% | 35% | 25% | 15% |

Short-horizon picks weight options flow most heavily (fast, reactive signal). Long-horizon picks weight reversal and insider activity more (slow, structural signals). The scanner runs in a `ThreadPoolExecutor` with 14 workers across the universe.

---

### 6.10 Congress Tracker

**Path:** `backend/features/congress/`
**API prefix:** `/api/v1/congress`
**Cache TTL:** 21600s (6 hours)

Fetches STOCK Act disclosures from two public S3 endpoints in parallel:

```
House:  https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json
Senate: https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json
```

#### Ticker Sentiment Classification

```
For each ticker across all members:
  Bullish  if purchase_count > sale_count × 1.5
  Bearish  if sale_count > purchase_count × 1.5
  Mixed    otherwise

Amount field: ranges like "$15,001–$50,000" → lower bound used as conservative estimate
```

Filters available: chamber (house/senate), transaction type (purchase/sale), ticker, date range (up to 1 year).

---

### 6.11 13F Institutional Holdings

**Path:** `backend/features/institutional/`
**API prefix:** `/api/v1/institutional`
**Cache TTL:** 3600s (1 hour)

Uses yfinance `institutional_holders` (pre-processed SEC 13F filings):

#### Position Action Classification

```
pct_change ≥  95%  → "new"      (new position opened)
pct_change ≤ −95%  → "closed"   (position liquidated)
pct_change >  10%  → "adding"
pct_change < −10%  → "trimming"
else               → "holding"
```

#### Net Flow Verdict

```
avg_change = mean(filtered_pct_changes)   # outliers ±50% excluded
accumulating  if avg_change > +1.0%
distributing  if avg_change < −1.0%
neutral       otherwise
```

Screener filters by minimum institutional ownership % and net flow direction across a 30-stock universe.

---

### 6.12 Portfolio Tracker

**Path:** `backend/features/portfolio/`
**API prefix:** `/api/v1/portfolio`
**Storage:** `backend/data/portfolio.json`

Stores positions (ticker, shares, cost_basis, date) as a JSON array. On each read, positions are enriched with live yfinance data:

```
current_value   = shares × current_price
unrealized_pnl  = current_value − (shares × cost_basis)
pnl_pct         = unrealized_pnl / (shares × cost_basis) × 100
day_change_pct  = (current_price − previous_close) / previous_close × 100

Portfolio summary:
  total_cost     = Σ (shares × cost_basis)
  total_value    = Σ current_value
  total_pnl      = total_value − total_cost
  total_pnl_pct  = total_pnl / total_cost × 100
```

---

### 6.13 Alerts & Watchlist

**Path:** `backend/features/alerts/`
**API prefix:** `/api/v1/alerts`
**Storage:** `backend/data/alerts.json`, `backend/data/watchlist.json`

#### Alert Types

| Type | Condition | Checked Against |
|------|-----------|----------------|
| `price` | above / below | yfinance `fast_info.last_price` |
| `reversal_confidence` | above / below | `/reversal/analyze/{ticker}` confidence field |
| `smart_money_score` | above / below | `/smart_money/ticker/{ticker}` composite_score |

Alerts are stored with a `triggered` boolean. Once triggered they stop firing until manually reset. The `GET /alerts/check` endpoint evaluates all untriggered alerts against live data and marks any that fired.

---

### 6.14 AI Research Agent

**Path:** `backend/features/ai_agent/`
**API prefix:** `/api/v1/ai_agent`

Uses Claude (claude-opus-4-5) with tool use. Requires `ANTHROPIC_API_KEY` in `.env`.

#### Available Tools

| Tool | What It Calls | Returns |
|------|--------------|---------|
| `get_price_data` | yfinance fast_info | spot price, change, 3M volume |
| `get_reversal_analysis` | reversal analyzer | direction, confidence, key signals |
| `get_options_analysis` | options analyzer | IV, PCR, expected move, max pain |
| `get_fundamentals` | yfinance info dict | PE, PB, margins, ROE, analyst target |
| `get_insider_activity` | insider router | last 8 transactions, net sentiment |

#### Endpoints

- **`/summary/{ticker}`** — Single-call synthesis: no tool loop, one LLM call with structured prompt
- **`/research`** — Agentic loop: Claude decides which tools to call, up to 10 iterations
- **`/chat`** — Stateless multi-turn: pass conversation history in request body; tools available mid-chat

---

## 7. Signal Model — How Scores Are Computed

Every signal in the system is normalized to a **[-1, +1] range** before weighting:

```
−1.0  maximum bearish signal
−0.5  moderately bearish
 0.0  neutral / no signal
+0.5  moderately bullish
+1.0  maximum bullish signal
```

This common scale lets every weighted composite use the same arithmetic:

```
composite = Σ (weight_i × score_i)
```

### Score Interpretation Guide

| Module | Score Range | What Drives It |
|--------|------------|----------------|
| Reversal | −1 to +1 | 23 signals across 4 categories, weighted |
| Smart Money | −1 to +1 | Options PCR + insider net buying + institutional trend |
| Market Intel | −1 to +1 | Horizon-weighted blend of options + reversal + smart money + insider |
| Insider | −1 to +1 | Net buy/sell value ratio over 90 days |
| Institution | −1 to +1 | Avg position change across top holders |
| Options | −1 to +1 | PCR (60%) + unusual activity (25%) + IV skew (15%) |
| F&G Index | 0 to 100 | 7-factor composite, linearly mapped |
| Growth Score | 0 to 100 | 6 fundamental metrics with threshold scoring |
| Quality Score | 0 to 100 | Altman Z + Piotroski F + ROE/ROIC/leverage |
| IV Rank | 0 to 100 | Current IV vs 1-year HV range |
| IV Percentile | 0 to 100 | % of days in past year with lower IV |

### Composite Calculation Example — Smart Money

```
NVDA (example):
  options_score  = +0.60  (low PCR 0.65, 4 unusual call strikes)
  insider_score  = −0.30  (net selling, 2 sales vs 0 buys)
  inst_score     = +0.10  (neutral, 72% institutionally held, avg change +0.5%)

composite = 0.60×0.40 + (−0.30)×0.35 + 0.10×0.25
          = 0.240 − 0.105 + 0.025
          = +0.160  → "Bullish"

Conflict detected: options (+0.60) vs insider (−0.30) — both exceed 0.25 threshold, opposite signs
→ amber warning badge: "Options bullish vs Insider bearish"
```

---

## 8. Frontend Architecture

### State Management (Zustand)

```javascript
// core/store.js
{
  ticker:    string,      // current active ticker (default: "AAPL")
  timeframe: string,      // "1h"|"1d"|"1w"|"1mo"|"3mo"|"6mo"|"1y"|"5y"|"all"
  watchlist: string[],    // ["AAPL", "TSLA", "NVDA", ...]
}
```

All feature views subscribe to `ticker` and `timeframe`. When the user types a new ticker in `TickerBar`, all mounted views immediately refetch.

### Routing

```
/                       → MarketHub (landing overview)
/reversal/*             → ReversalFeature
/options/*              → OptionsFeature
/earnings/*             → EarningsFeature
/technical/*            → TechnicalFeature
/fundamental/*          → FundamentalFeature
/sentiment/*            → SentimentFeature
/insider/*              → InsiderFeature
/smart_money/*          → SmartMoneyFeature
/market_intel/*         → MarketIntelFeature
/congress/*             → CongressFeature
/institutional/*        → InstitutionalFeature
/portfolio/*            → PortfolioFeature
/alerts/*               → AlertsFeature
/ai_agent/*             → AIAgentFeature
```

### Feature Registry (`frontend/src/features/index.js`)

Mirrors backend manifests. Used by `Sidebar.jsx` to build the 2-level navigation — no hardcoded nav items. Adding a backend feature + its frontend `index.jsx` + a registry entry is all that's needed to fully wire a new module.

### Design System

CSS variables in `src/index.css`:
- Background scale: `#020817` → `#0f172a` → `#1e293b` → `#334155`
- Accent: `#6366f1` (indigo) for interactive elements
- Bullish: `#22c55e` / `#4ade80` · Bearish: `#ef4444` / `#f87171`
- Text: `#e2e8f0` primary · `#94a3b8` secondary · `#64748b` muted · `#475569` disabled

---

## 9. API Reference

### Meta

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | `{status, version}` |
| GET | `/api/v1/features` | All feature manifests |

### Reversal

| Method | Path | Key Params |
|--------|------|------------|
| GET | `/api/v1/reversal/analyze/{ticker}` | `explain`, `lookback_days` |
| POST | `/api/v1/reversal/analyze` | body: `AnalysisRequest` |
| POST | `/api/v1/reversal/watchlist` | body: `{tickers, explain}` |
| GET | `/api/v1/reversal/sectors` | — |
| GET | `/api/v1/reversal/macro` | — |

### Options

| Method | Path | Key Params |
|--------|------|------------|
| GET | `/api/v1/options/expirations/{ticker}` | — |
| GET | `/api/v1/options/chain/{ticker}` | `expiration`, `strike_range` |
| GET | `/api/v1/options/unusual/{ticker}` | `max_expirations`, `min_score` |
| GET | `/api/v1/options/skew/{ticker}` | `max_expirations` |
| GET | `/api/v1/options/analysis/{ticker}` | `timeframe` → returns IV Rank + Percentile |

### Earnings

| GET | `/api/v1/earnings/calendar` | `tickers` (comma-sep) |
| GET | `/api/v1/earnings/analysis/{ticker}` | — |

### Technical

| GET | `/api/v1/technical/indicators/{ticker}` | — |
| GET | `/api/v1/technical/patterns/{ticker}` | — |
| GET | `/api/v1/technical/levels/{ticker}` | — |
| GET | `/api/v1/technical/screener` | — |

### Fundamental

| GET | `/api/v1/fundamental/valuation/{ticker}` | — |
| GET | `/api/v1/fundamental/growth/{ticker}` | — |
| GET | `/api/v1/fundamental/health/{ticker}` | — |
| GET | `/api/v1/fundamental/screener` | — |

### Sentiment

| GET | `/api/v1/sentiment/dashboard` | — |

### Insider

| GET | `/api/v1/insider/feed/{ticker}` | `lookback_days` |
| GET | `/api/v1/insider/cluster` | `tickers` (comma-sep) |

### Smart Money

| GET | `/api/v1/smart_money/scan` | `tickers`, `refresh` |
| GET | `/api/v1/smart_money/ticker/{ticker}` | — |

### Market Intelligence

| GET | `/api/v1/market_intel/scan` | `horizon` (1w/1m/3m), `limit` |
| GET | `/api/v1/market_intel/overview` | — |

### Congress

| GET | `/api/v1/congress/feed` | `chamber`, `type`, `ticker`, `days` |
| GET | `/api/v1/congress/members` | — |
| GET | `/api/v1/congress/tickers` | — |

### Institutional (13F)

| GET | `/api/v1/institutional/holders/{ticker}` | — |
| GET | `/api/v1/institutional/flow/{ticker}` | — |
| GET | `/api/v1/institutional/screener` | `min_inst_pct`, `flow` |

### Portfolio

| GET | `/api/v1/portfolio/holdings` | — |
| POST | `/api/v1/portfolio/add` | body: `{ticker, shares, cost_basis, added_date}` |
| DELETE | `/api/v1/portfolio/{id}` | — |
| PATCH | `/api/v1/portfolio/{id}` | body: `{shares?, cost_basis?}` |

### Alerts & Watchlist

| GET | `/api/v1/alerts/watchlist` | — |
| POST | `/api/v1/alerts/watchlist` | body: `{ticker}` |
| DELETE | `/api/v1/alerts/watchlist/{ticker}` | — |
| GET | `/api/v1/alerts/list` | — |
| POST | `/api/v1/alerts/add` | body: `{ticker, type, condition, value, note}` |
| DELETE | `/api/v1/alerts/{id}` | — |
| POST | `/api/v1/alerts/{id}/reset` | — |
| GET | `/api/v1/alerts/check` | Evaluates all active alerts against live data |

### AI Agent

| GET | `/api/v1/ai_agent/summary/{ticker}` | — |
| POST | `/api/v1/ai_agent/research` | body: `{query}` |
| POST | `/api/v1/ai_agent/chat` | body: `{messages: [...]}` |

---

## 10. Data Sources & Caching

### Data Sources

| Source | What It Provides | Access |
|--------|-----------------|--------|
| Yahoo Finance | OHLCV, options chains, financials, insider transactions, institutional holders | yfinance (HTTP, unauthenticated) |
| SEC EDGAR | Institutional holdings pre-processed by yfinance | via yfinance wrappers |
| House Stock Watcher S3 | Congressional trades (House) | Public S3, JSON |
| Senate Stock Watcher S3 | Congressional trades (Senate) | Public S3, JSON |
| Anthropic API | Claude LLM inference | REST API, requires key |

### Cache TTL Reference

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| OHLCV / spot price | 300s | Price moves frequently but 5-min delay is acceptable |
| Macro / sector data | 300s | Intraday moves; same cadence as price data |
| Computed reversal signals | 60s | Derivative of price data; can be slightly fresher |
| Options chains | 120s | Options IV moves fast; keep reasonably fresh |
| Options analysis / skew | 180s | More expensive to compute; slightly longer cache |
| IV Rank | 3600s | Based on 1Y HV; changes slowly |
| Smart Money scan | 3600s | Institutional/insider data is quarterly; daily enough |
| Market Intel scan | 1800s | Balances freshness vs. expensive multi-signal computation |
| Fundamental data | 3600s | Quarterly filings; hourly freshness is unnecessary |
| Congress data | 21600s | STOCK Act filings; 6-hour delay acceptable |
| Institutional (13F) | 3600s | Quarterly filings |
| Sentiment (F&G) | 900s | 15-min updates; intraday sentiment shifts matter |

---

## 11. Scaling Notes

### Current Bottlenecks

**1. Yahoo Finance is the single point of failure**

All features depend on yfinance. Yahoo Finance has no SLA, no authentication, and rate-limits aggressively. At approximately 5+ concurrent users, 429 responses and stale data become frequent.

**2. In-memory cache doesn't survive multiple workers**

`core/cache.py` is a process-local dict. Running `uvicorn --workers 4` gives 4 independent caches — Yahoo Finance gets hit 4× as often per TTL window.

**3. Smart Money + Market Intel scans are slow on first call**

Scanning 60–65 tickers concurrently takes 20–40 seconds. `ThreadPoolExecutor(max_workers=12-14)` helps, but yfinance's blocking HTTP calls are the bottleneck, not CPU.

### Recommended Fixes (in priority order)

**Replace in-memory cache with Redis** — this unblocks multi-worker deployment:
```python
# swap core/cache.py backend from dict to redis.Redis
# TTL values stay the same; just change storage medium
```

**Add background pre-fetch** — eliminate cold-start latency for common data:
```python
# FastAPI lifespan hook
@asynccontextmanager
async def lifespan(app):
    asyncio.create_task(refresh_macro_loop())   # every 4 min
    asyncio.create_task(refresh_sector_loop())  # every 4 min
    yield
```

**Run multiple workers with Redis in place:**
```bash
uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000
```

**Move bulk scans to a task queue** — return a job ID immediately, poll for completion:
```
POST /smart_money/scan → {job_id: "abc123"}
GET  /jobs/abc123      → {status: "running"} or {status: "done", data: {...}}
```

**Replace yfinance with a paid data provider** for production:

| Provider | Data | Notes |
|----------|------|-------|
| Polygon.io | OHLCV, options, news | Free tier available; paid for real-time |
| Alpaca Markets | OHLCV, news | Free with brokerage account |
| CBOE DataShop | True historical IV | Needed for accurate IV Rank |
| SEC EDGAR API | True 13F XML | More reliable than yfinance wrappers |

### Latency Reference

| Operation | Single User | 5 Concurrent Users (no Redis) |
|-----------|-------------|-------------------------------|
| Single reversal analyze | 1–3s | 2–8s (Yahoo throttling) |
| 20-ticker watchlist scan | 15–30s | 30–60s+ |
| Options chain (cached) | <100ms | <100ms |
| Smart Money scan (cold) | 25–40s | Often fails (429s) |
| Smart Money scan (cached) | <100ms | <100ms |
| Congress feed (cached) | <50ms | <50ms |
| Portfolio holdings (5 positions) | 1–2s | 2–5s |
