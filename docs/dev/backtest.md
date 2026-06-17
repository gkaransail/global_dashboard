# Backtest & RL Optimizer — Developer Reference

> See also: `/BACKTEST_METHODOLOGY.md` for the full algorithmic specification.

## Purpose
Auto-logs options analysis predictions to SQLite, evaluates outcomes against actual prices after the evaluation window, and uses a contextual bandit RL algorithm to optimize signal weights.

## Files
```
backend/features/backtest/
├── router.py     API endpoints
├── db.py         SQLite schema, CRUD, watchlist functions
├── collector.py  log_prediction() — called from get_analysis()
├── evaluator.py  evaluate_pending(), force_evaluate_all()
├── rl.py         run_rl_update(), get_weights_summary()
└── manifest.py   Feature metadata
frontend/src/features/backtest/
└── index.jsx     Dashboard: stats, weights, prediction log
```

## API Endpoints (`/api/v1/backtest`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Overall accuracy stats + by-timeframe breakdown |
| `GET` | `/predictions` | All evaluated predictions (newest first, limit param) |
| `GET` | `/pending` | All unevaluated predictions |
| `POST` | `/evaluate` | Evaluate matured predictions (evaluate_after ≤ today) |
| `POST` | `/force-evaluate` | Evaluate ALL pending against current price immediately |
| `POST` | `/train` | Run RL weight update over all evaluated predictions |
| `GET` | `/weights` | Current signal weights with accuracy and drift |
| `POST` | `/reset-weights` | Reset all weights to base values |
| `GET` | `/watchlist` | Get persisted watchlist |
| `POST` | `/watchlist` | Set watchlist (body: `{tickers: []}`) |
| `POST` | `/scan-watchlist` | Run get_analysis() for each watchlist ticker, log predictions |

## Database Schema (`db.py`)

### `predictions` table
Key fields: `ticker`, `timeframe`, `predicted_at`, `direction` (1/-1/0), `score`, `spot_at_prediction`, `pc_atm_ratio`, `pc_vol_ratio`, `iv_rank`, `squeeze_candidate`, `gex_environment`, `options_flow_significance`, `max_pain_pct`, `expected_move_pct`, `evaluate_after`, `evaluated`, `spot_at_outcome`, `actual_return_pct`, `correct`, `source`.

### `signal_weights` table
`signal_name` (PK), `weight`, `base_weight`, `accuracy`, `sample_count`, `updated_at`.

### `watchlist` table
`ticker` (PK), `added_at`.

## Prediction Logging Flow
```
User views Options Analysis tab
  → get_analysis(ticker, timeframe)  [analysis.py]
  → log_prediction(analysis, source="options_analysis")  [collector.py]
    → _already_logged_today(ticker, timeframe)?  → skip
    → derive score from pc_ratio, max_pain, iv_rank, squeeze
    → compute evaluate_after = today + TIMEFRAME_EVAL_DAYS[timeframe]
    → db.insert_prediction(...)
```

## RL Algorithm (`rl.py`)
Contextual bandit with gradient updates:
```python
reward = actual_return_pct × direction  # positive = correct prediction
delta  = LEARNING_RATE × reward × |contribution| / 3.0
new_weight = clamp(old_weight + delta, 0.1, 5.0)
```
`LEARNING_RATE = 0.05`. 10 signals tracked. See `BACKTEST_METHODOLOGY.md` for full signal list.

## Source Tracking
`source` field distinguishes prediction origin:
- `options_analysis` — auto-logged from the Options Analysis tab
- `watchlist` — logged via `/scan-watchlist` endpoint
- `top_movers` — planned for scanner-triggered logging

## Evaluation Windows (`collector.py::TIMEFRAME_EVAL_DAYS`)
`1h→1d, 1d→3d, 1w→7d, 1mo→30d, 3mo→90d, 6mo→180d, 1y→365d`

## Frontend Sync
Zustand `watchlist` syncs to backend via `POST /backtest/watchlist` on every change (useEffect in `index.jsx`).
