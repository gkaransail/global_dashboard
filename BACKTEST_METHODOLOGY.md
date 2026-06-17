# Backtest & RL Optimizer — Methodology

## Overview

Every options analysis view auto-logs a prediction. After the evaluation window passes, the
actual price move is compared against the prediction. A reinforcement learning optimizer then
adjusts signal weights based on which signals actually predicted direction correctly.

---

## 1. Prediction Logging

**Trigger:** Called automatically inside `get_analysis()` (backend: `features/options/analyzers/analysis.py`).
One prediction is logged per ticker × timeframe × calendar day.

**Sources tracked via `source` field:**
| Source | When logged |
|---|---|
| `options_analysis` | User views a ticker's Options Analysis tab |
| `watchlist` | User clicks "Scan Watchlist" in Backtest tab |
| `top_movers` | *(planned)* Top 20 scanner run |

### Prediction fields stored

| Field | Description |
|---|---|
| `ticker` | Stock symbol |
| `timeframe` | `1h`, `1d`, `1w`, `1mo`, `3mo`, `6mo`, `1y` |
| `direction` | `1` = bullish, `-1` = bearish, `0` = neutral |
| `score` | Composite signal score (–5 to +5) |
| `spot_at_prediction` | Stock price at time of logging |
| `pc_atm_ratio` | ATM put/call ratio |
| `pc_vol_ratio` | Volume-weighted put/call ratio |
| `iv_rank` | IV rank (0–100) |
| `short_pct_float` | Short interest as % of float |
| `squeeze_candidate` | Boolean — short squeeze setup detected |
| `gex_environment` | `positive` / `negative` gamma exposure |
| `options_flow_significance` | `Normal`, `High`, or `Extreme` |
| `max_pain_pct` | Max pain distance from spot (%) |
| `expected_move_pct` | Market-implied ±move for expiration |
| `evaluate_after` | ISO date when to check the outcome |

---

## 2. Score Derivation

The prediction score is a signed integer (–5 to +5) derived from live signal values:

```
score = 0

ATM P/C ratio (pc_atm_ratio or pc_vol_ratio or pc_ratio):
  < 0.6  → +3 (strong call buying, bullish)
  < 0.8  → +2
  < 1.0  → +1
  < 1.2  → −1
  < 1.5  → −2
  ≥ 1.5  → −3 (strong put buying, bearish)

Max pain:
  > 2% above spot → +1 (market gravitates up to max pain)
  < −2% below spot → −1

IV rank:
  > 70  → −1 (fear, elevated vol often reverses)
  < 25  → +1 (calm, premium selling favors bulls)

Squeeze candidate:
  True → +1 (potential short squeeze upside)

direction = sign(score)  →  1 (bull) / −1 (bear) / 0 (neutral)
```

---

## 3. Evaluation Windows

| Timeframe | Evaluated after |
|---|---|
| 1h | 1 day |
| 1d | 3 days |
| 1w | 7 days |
| 1mo | 30 days |
| 3mo | 90 days |
| 6mo | 180 days |
| 1y | 365 days |

**"Evaluate Matured"** — only runs on predictions whose window has passed.

**"Force Evaluate All"** — evaluates every pending prediction immediately against the current spot
price. Useful for testing or when you want intraday results. Note: accuracy will be lower than
natural evaluation because short-term noise dominates over brief periods.

### Correctness definition

| Predicted direction | Correct if |
|---|---|
| Bullish (1) | Actual return > 0% |
| Bearish (−1) | Actual return < 0% |
| Neutral (0) | \|Actual return\| < 1% |

---

## 4. Reinforcement Learning Weight Optimizer

The optimizer treats each signal as a feature in a linear scoring policy.
After each evaluated prediction, signal weights are updated via a policy gradient step.

### Algorithm (Contextual Bandit)

```
For each evaluated prediction:
  reward = actual_return_pct × direction
           > 0 → prediction correct (bullish + up, or bearish + down)
           < 0 → prediction wrong

  For each signal that contributed to this prediction:
    delta = learning_rate × reward × |contribution| / 3.0
    weight[signal] = clamp(weight[signal] + delta, 0.1, 5.0)
```

- `learning_rate = 0.05`
- Weights clamped to `[0.1, 5.0]` — no signal ever disappears entirely

### Signals tracked

| Signal key | Base weight | Condition |
|---|---|---|
| `atm_pc_bull` | 3.0 | P/C < 1.0 (bullish flow) |
| `atm_pc_bear` | 3.0 | P/C ≥ 1.0 (bearish flow) |
| `max_pain_above` | 1.0 | Max pain > 2% above spot |
| `max_pain_below` | 1.0 | Max pain < −2% below spot |
| `iv_rank_calm` | 1.0 | IV rank < 25 |
| `iv_rank_fear` | 1.0 | IV rank > 70 |
| `squeeze` | 1.0 | Squeeze candidate detected |
| `gex_positive` | 0.5 | GEX environment = positive |
| `gex_negative` | 0.5 | GEX environment = negative |
| `activity_extreme` | 0.5 | Options flow = Extreme |

### Interpreting weight drift

| Drift color | Meaning |
|---|---|
| Green (+) | Signal outperforming its base rate — used more in scoring |
| Red (−) | Signal underperforming — penalized, given less influence |
| Neutral | Insufficient data (< ~20 samples) |

Weight drift stabilizes after ~50+ predictions per signal. Early drift is noisy.

---

## 5. Watchlist Scanning

The watchlist (from the Alerts & Watchlist feature) is auto-synced to the backend whenever it
changes. Clicking **"Scan Watchlist"** triggers `get_analysis()` for every ticker in the watchlist
and logs each as a prediction with `source = 'watchlist'`.

This means you can:
1. Set up your watchlist in the Alerts tab
2. Click "Scan Watchlist" daily (or let the auto-sync handle it)
3. After 30 days, evaluate the 1mo predictions and see which signals called the moves correctly
4. Run RL training to let the optimizer weight signals accordingly

---

## 6. Limitations & Known Caveats

- **Intraday force-evaluate**: Win rates from "Force Evaluate All" will be low (expected ~45–55%)
  because stock prices are noisy on short horizons. Wait for the natural window for meaningful results.

- **No look-ahead bias**: The score is computed at logging time using only data available then.
  The current spot price at evaluation is fetched fresh from yfinance.

- **Single-factor correctness**: A prediction is binary correct/wrong based on direction only,
  not magnitude. A +0.01% return counts the same as +20% for a bullish call.

- **Small sample sizes**: With < 30 evaluated predictions per signal, RL weights are unreliable.
  Run the system for at least 1–2 months before trusting weight drift as signal.

- **Yahoo Finance rate limits**: Force-evaluating many tickers at once may hit rate limits.
  The evaluator will log errors for any tickers it couldn't fetch.

- **No position sizing**: This system tracks directional accuracy only, not P&L from actual
  options positions. Strike selection, IV changes, and theta are not modeled.
