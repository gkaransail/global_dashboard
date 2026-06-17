# Alerts & Watchlist — Developer Reference

## Purpose
Persistent watchlist with live quotes and a configurable alert system supporting price, reversal confidence, and smart money score thresholds.

## Files
```
backend/features/alerts/
├── router.py   API endpoints
├── store.py    JSON persistence — watchlist and alerts
└── checker.py  check_all(), get_watchlist_quotes()
frontend/src/features/alerts/
└── index.jsx   Tab router: watchlist / alerts
```

## API Endpoints (`/api/v1/alerts`)

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/watchlist` | — | Watchlist items with live quotes |
| `POST` | `/watchlist` | `{ticker}` | Add ticker to watchlist |
| `DELETE` | `/watchlist/{ticker}` | — | Remove ticker from watchlist |
| `GET` | `/list` | — | All configured alerts |
| `POST` | `/add` | `AddAlertRequest` | Create an alert |
| `DELETE` | `/{alert_id}` | — | Delete an alert |
| `POST` | `/{alert_id}/reset` | — | Reset a triggered alert |
| `GET` | `/check` | — | Run live alert check, returns triggered |

## Alert Types (`VALID_TYPES`)
- `price` — triggers when stock price crosses a threshold
- `reversal_confidence` — triggers when reversal signal confidence crosses a value (0.0–1.0)
- `smart_money_score` — triggers when screener smart_money score crosses a value (0–100)

## Alert Conditions (`VALID_CONDITIONS`)
- `above` — trigger when value exceeds threshold
- `below` — trigger when value falls below threshold

## AddAlertRequest
```python
class AddAlertRequest(BaseModel):
    ticker: str
    type: str        # price | reversal_confidence | smart_money_score
    condition: str   # above | below
    value: float     # threshold value
    note: str = ""   # optional user label
```

## Checker (`checker.py::check_all`)
1. Fetches all untriggered alerts from store
2. For each alert:
   - `price` → `yf.Ticker(t).fast_info.last_price`
   - `reversal_confidence` → calls `analyze_ticker()`
   - `smart_money_score` → calls `score_ticker()`
3. Evaluates condition (`above` / `below`)
4. If triggered: marks alert as triggered in store, returns it

## Watchlist Quotes (`checker.py::get_watchlist_quotes`)
Batch fetches price + 1d change for all watchlist tickers. Each item:
```json
{
  "ticker": "NVDA",
  "price": 134.50,
  "change_1d_pct": 1.8,
  "change_1d_abs": 2.38
}
```

## Persistence (`store.py`)
Two JSON files:
- `backend/data/watchlist.json` — list of `{ticker, added_at}`
- `backend/data/alerts.json` — list of alert objects with `{id, ticker, type, condition, value, note, triggered, triggered_at}`

`id` = UUID4.

## Relationship to Backtest Watchlist
The `alerts/watchlist` is a separate store from `backtest/watchlist`. Both exist independently:
- `alerts/watchlist` — used for live price tracking and alerts
- `backtest/watchlist` — used for prediction logging and backtesting

The Zustand `watchlist` in `store.js` syncs to the **backtest** watchlist (via `POST /backtest/watchlist`). The alerts watchlist is managed directly via `POST /alerts/watchlist`.
