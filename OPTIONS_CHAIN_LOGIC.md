# Options Chain Analysis — How It Works

A plain-English + technical guide to every signal the dashboard computes, why each metric is calculated the way it is, and the reasoning behind the signal priority hierarchy.

---

## Architecture Overview

```
User selects ticker + timeframe
        │
        ▼
GET /api/v1/options/analysis/{ticker}?timeframe=1w
        │
        ▼
analysis.py — get_analysis()
  ├── _get_spot()              → current price (fast_info → history fallback)
  ├── _get_expirations()       → all available option expiry dates
  ├── _pick_best_expiration()  → best expiry for the selected timeframe
  ├── yf.option_chain(exp)     → raw calls + puts from Yahoo Finance
  ├── calc_expected_move()     → ±1σ price range
  ├── calc_max_pain()          → strike where option sellers lose least
  ├── find_key_levels()        → high-OI strikes acting as support/resistance
  ├── calc_iv_rank()           → where current IV sits vs past year
  └── generate_narrative()     → plain-English summary of all signals
```

---

## Signal Priority: Why ATM P/C Comes First

The dashboard uses **three P/C ratios** and chooses a primary in this order:

```
1. pc_atm_ratio  — near-money only (±10% of spot)   ← PRIMARY
2. pc_vol_ratio  — today's volume, all strikes       ← SECONDARY
3. pc_ratio      — open interest, all strikes        ← FALLBACK
```

### Why this order matters

**The problem with overall P/C (what most dashboards show):**

Large institutions constantly buy far out-of-the-money (OTM) puts as cheap tail-risk insurance. For example, a fund holding $500M of MU stock will buy $500-strike puts (49% below spot) as a disaster hedge. These puts are cheap, generate massive open interest, and push the overall P/C ratio above 1.0 — making the stock *look* bearish even when the near-money flow is bullish.

**Example — MU (June 2026):**

| Signal | Value | Read | Correct? |
|--------|-------|------|----------|
| Overall P/C OI | 1.42 | Bearish | ❌ Distorted by LEAPS + far-OTM hedges |
| Overall P/C Vol | 2.06 | Bearish | ❌ Far-OTM put buying inflating ratio |
| **ATM P/C OI** | **0.52** | **Bullish** | ✅ Near-money calls dominating |

**ATM strips out the noise:** By limiting to strikes within ±10% of spot, we only count options that actually reflect near-term directional conviction — not 2-year disaster insurance.

---

## Each Signal Explained

### 1. Put/Call Ratio — ATM (`pc_atm_ratio`)

```python
atm_calls = [c for c in calls if spot * 0.90 <= c["strike"] <= spot * 1.10]
atm_puts  = [p for p in puts  if spot * 0.90 <= p["strike"] <= spot * 1.10]
pc_atm_ratio = atm_put_oi / atm_call_oi
```

- **What it means:** Ratio of put open interest to call open interest, restricted to strikes within 10% of the current price.
- **Why ATM:** These are the options with the highest gamma — most sensitive to price moves in the next 1–2 weeks. Traders with real directional conviction buy ATM options, not far-OTM.
- **Interpretation:**
  - `< 0.7` → Very Bullish (heavy call dominance near the money)
  - `0.7–0.9` → Bullish
  - `0.9–1.1` → Neutral
  - `1.1–1.4` → Cautious / Mildly Bearish
  - `> 1.4` → Very Bearish

---

### 2. Put/Call Ratio — Volume (`pc_vol_ratio`)

```python
total_call_vol = sum(c.get("volume") or 0 for c in calls)
total_put_vol  = sum(p.get("volume") or 0 for p in puts)
pc_vol_ratio   = total_put_vol / total_call_vol
```

- **What it means:** Today's trading volume in puts vs calls across all strikes.
- **More current than OI:** Volume resets each day. OI accumulates over weeks/months.
- **Limitation:** Includes all strikes, so far-OTM put buying (cheap hedges) inflates it.
- **Best use:** Confirms ATM direction. If ATM says bullish and volume says bearish, flag as "Hedged" — institutions may be buying upside exposure AND buying cheap downside insurance simultaneously.

---

### 3. Put/Call Ratio — Open Interest (`pc_ratio`)

```python
pc_ratio = total_put_oi / total_call_oi
```

- **What it means:** Total accumulated put contracts vs call contracts outstanding.
- **Slowest signal:** OI builds over weeks. A bearish OI reading today might reflect hedges placed a month ago.
- **Best use:** Context for long-term positioning. Not reliable for 1-week outlook.

---

### 4. Expected Move

```python
move_dollar = spot * atm_iv * sqrt(dte / 365)
upper = spot + move_dollar
lower = spot - move_dollar
```

- **What it means:** The ±1 standard deviation price range implied by the ATM option's IV.
- **Probability:** 68% chance the stock stays within this range by expiration.
- **Source:** Black-Scholes relationship between IV and expected move. No guessing — it's pure math from option prices.
- **Important:** This is the *market's implied* move, not a prediction. It's symmetric — the market has no directional view here, only magnitude.

---

### 5. Max Pain

```python
for test_strike in all_strikes:
    call_pain = sum(max(0, test_strike - s) * oi for s, oi in call_map.items())
    put_pain  = sum(max(0, s - test_strike) * oi for s, oi in put_map.items())
    total_pain = call_pain + put_pain
# Max pain = strike with lowest total_pain
```

- **What it means:** The price at expiration where option *holders* collectively lose the most money (= where market makers / option *sellers* lose the least).
- **Why it matters:** Market makers are net-short options (they sell to retail). They hedge their exposure by buying/selling the underlying stock — which can push price toward max pain near expiry.
- **The ±40% filter:** We only include strikes within 40% of spot. LEAPS (1–2 year puts at very low strikes) have massive OI that would otherwise pull max pain far below reality.

```python
lo, hi = spot * 0.60, spot * 1.40
call_map = {c["strike"]: c["oi"] for c in calls if lo <= c["strike"] <= hi}
put_map  = {p["strike"]: p["oi"] for p in puts  if lo <= p["strike"] <= hi}
```

- **Caution:** Max pain effect is strongest in the **last 2–3 days before expiry** and for **stocks with heavy options activity** relative to float. It's a gravitational pull, not a guarantee.

---

### 6. Key OI Levels (Support & Resistance)

```python
# Position relative to spot determines role — NOT option type
# Call above spot  → resistance  (market makers short these calls, sell stock to hedge)
# Call below spot  → support     (deep ITM calls = long synthetic stock)
# Put below spot   → support     (market makers short these puts, buy stock to hedge)
# Put above spot   → resistance  (deep ITM puts = synthetic short)

role = "resistance" if strike >= spot else "support"   # for calls
role = "support" if strike <= spot else "resistance"   # for puts
```

- **Why this matters:** High OI strikes create price "gravity." Market makers who are short large numbers of calls/puts delta-hedge by trading the underlying, creating buying pressure at support levels and selling pressure at resistance levels.
- **Top 5 calls + top 5 puts** by OI are evaluated, minimum 100 contracts to qualify.
- **Results sorted by distance from spot** so the nearest levels appear first.

**Common mistake:** Many tools label all calls as "resistance" and all puts as "support." This is wrong. A call 10% *below* spot is deep ITM — it behaves like a long stock position, not a ceiling. The role depends on **where the strike is relative to current price**, not what type of option it is.

---

### 7. ATM IV and IV Rank

```python
# ATM IV: nearest call strike to spot
atm_call = min(calls, key=lambda c: abs(c["strike"] - spot))
atm_iv   = atm_call["iv"]

# IV Rank = (current IV - 52w low HV) / (52w high HV - 52w low HV) * 100
# Uses 21-day rolling historical volatility as IV proxy
```

- **ATM IV:** The implied volatility of the nearest-to-money call. Tells you how expensive options are right now.
- **IV Rank (0–100):** Where current IV sits relative to its 52-week range.
  - `> 80` → IV is very high vs history — options expensive, consider selling premium
  - `20–80` → Normal range
  - `< 20` → IV is very low — options cheap, consider buying
- **IV Percentile:** % of days in the past year where IV was lower than today. More stable than IV Rank when the 52w range has extreme outliers.

---

### 8. Narrative Generation

The narrative is built in `generate_narrative()` and follows a fixed structure:

```
1. Sentiment sentence       → ATM P/C primary signal + conflict note if hedging detected
2. Expected move sentence   → ± % range by expiration
3. Max pain sentence        → $ level and % from spot
4. Key resistance level     → nearest call OI wall above spot
5. Key support level        → nearest put OI wall below spot
6. IV context               → expensive / normal / cheap
```

**Conflict detection — "Hedged" signal:**

```python
if (atm bullish) and (overall volume bearish):
    → "Note: overall volume P/C is X.XX — higher because institutions are buying
       far-OTM puts as portfolio insurance, not as directional bets."
```

This catches the common pattern where a stock looks bearish on overall P/C but the actual near-money positioning is bullish.

---

## Expiration Selection

```python
def timeframe_to_days(timeframe):
    return {"1h": 1, "1d": 3, "1w": 7, "1mo": 30, "3mo": 90, ...}[timeframe]

# Pick expiration closest to 75% of timeframe window, minimum 3 DTE
target_dte = max(7, int(max_dte * 0.75))
best_exp = min(candidates, key=lambda e: abs(e["dte"] - target_dte))
```

- For `1w` → targets ~5 DTE (75% of 7 days). Picks the nearest weekly expiry.
- Minimum 3 DTE enforced to avoid same-day/next-day expiry noise (zero-DTE options behave very differently).

---

## Data Source and Staleness

- **Source:** Yahoo Finance via `yfinance` library. Data is delayed ~15–20 minutes.
- **Cache TTL:** 10 minutes (`CACHE_TTL = 600`). Analysis is cached per ticker+timeframe.
- **Rate limiting:** Yahoo Finance aggressively rate-limits. If you get errors, wait 30–60 seconds and retry. The `_get_spot()` function has a fallback from `fast_info.last_price` to `history(period="5d")` to handle partial rate-limit responses.
- **Cache invalidation:** `core/cache.py` has `invalidate(key)` and `clear()` functions. Cache keys follow the pattern `options_analysis_{TICKER}_{timeframe}`.

---

## File Map

```
backend/features/options/
  analyzers/
    analysis.py     ← Main entry point: get_analysis(), generate_narrative()
    chain.py        ← Raw chain fetch + Black-Scholes Greeks
    skew.py         ← IV skew + term structure
    unusual.py      ← Unusual activity detector (vol/OI ratio + premium score)
  router.py         ← FastAPI routes: /analysis, /chain, /expirations, /skew, /unusual

frontend/src/features/options/
  OptionsOverview.jsx   ← "At a Glance" page: mood, expected move, key levels
  MarketSnapshot.jsx    ← Compact card shown at top of Options tab
  OptionsChain.jsx      ← Full chain table with Greeks
  VolSkew.jsx           ← IV skew chart
  UnusualActivity.jsx   ← Unusual flow table
```

---

## Why the Dashboard Used to Say Bearish (and How It Was Fixed)

**The bug:** Three components (`OptionsOverview`, `MarketSnapshot`, and `generate_narrative`) were all using `pc_ratio` (overall OI P/C) as the primary sentiment signal. For stocks like MU and SNDK, institutions hold large stock positions and hedge them with far-OTM puts — driving `pc_ratio` above 1.0 (bearish) even when near-money positioning is clearly bullish.

**The fix (June 2026):**
1. `analysis.py` — `generate_narrative()` now takes `pc_atm_ratio` and uses it as primary signal.
2. `MarketSnapshot.jsx` — Sentiment chip now reads `pc_atm_ratio ?? pc_vol_ratio ?? pc_ratio`.
3. `OptionsOverview.jsx` — `moodFromPC()` now takes all three ratios; explanation text mentions when far-OTM hedges are distorting the overall ratio.
4. `calc_max_pain()` — Added ±40% spot filter to exclude LEAPS from the calculation.
5. `find_key_levels()` — Role now based on strike position relative to spot, not option type.

---

## Reading the Signals Together

| Scenario | ATM P/C | Volume P/C | OI P/C | What It Means |
|----------|---------|------------|--------|---------------|
| Clean bullish | < 0.8 | < 0.9 | < 1.0 | Genuine upside conviction across all timeframes |
| **Hedged bullish** | **< 0.8** | **> 1.2** | **> 1.3** | **Near-money bullish; far-OTM puts = portfolio insurance** |
| Mixed / uncertain | ~1.0 | ~1.0 | ~1.0 | No directional edge from options |
| Clean bearish | > 1.3 | > 1.3 | > 1.4 | Genuine downside positioning near the money |
| OI lagging | < 0.8 | < 0.8 | > 1.3 | Volume shifted bullish; old OI hasn't unwound yet |

The **"Hedged bullish"** pattern is the most common and most misread. It looks bearish on a basic P/C screen but actually signals that institutions are long the stock and just protecting against tail risk.
