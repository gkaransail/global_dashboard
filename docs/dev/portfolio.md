# Portfolio Tracker — Developer Reference

## Purpose
Tracks stock positions with cost basis, computes unrealized P&L with live prices, and provides portfolio-level summary statistics. Positions are persisted in a local JSON store.

## Files
```
backend/features/portfolio/
├── router.py   API endpoints
└── store.py    JSON file persistence — get_all(), add_position(), update_position(), remove_position()
frontend/src/features/portfolio/
└── index.jsx   Tab router: holdings / summary
```

## API Endpoints (`/api/v1/portfolio`)

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/holdings` | — | All positions with live P&L |
| `POST` | `/add` | `{ticker, shares, cost_basis, added_date?}` | Add a new position |
| `DELETE` | `/{position_id}` | — | Remove a position |
| `PATCH` | `/{position_id}` | `{shares?, cost_basis?}` | Update position |

## Position Model
```python
class AddPositionRequest(BaseModel):
    ticker: str
    shares: float      # must be > 0
    cost_basis: float  # per-share cost, must be > 0
    added_date: Optional[str] = None  # ISO date, defaults to today
```

## Live Enrichment (`_enrich_position`)
For each stored position, on every `GET /holdings` call:
1. `yf.Ticker(ticker).fast_info.last_price` → current price
2. `fast_info.previous_close` → day change %
3. Compute:
   - `total_cost = shares × cost_basis`
   - `current_value = shares × current_price`
   - `unrealized_pnl = current_value − total_cost`
   - `pnl_pct = unrealized_pnl / total_cost × 100`

## Portfolio Summary
```json
{
  "summary": {
    "total_cost": 125000.00,
    "total_value": 138500.00,
    "total_pnl": 13500.00,
    "total_pnl_pct": 10.8,
    "position_count": 5
  }
}
```

## Persistence (`store.py`)
JSON file at `backend/data/portfolio.json`. Format:
```json
[
  {
    "id": "uuid4",
    "ticker": "AAPL",
    "shares": 100.0,
    "cost_basis": 150.00,
    "added_date": "2026-01-15"
  }
]
```

`position_id` is a UUID4 generated at insert time.

## Error Handling
- `shares <= 0` or `cost_basis <= 0` → 400 Bad Request
- Position not found on DELETE/PATCH → 404
- yfinance failure in `_enrich_position` → `current_price=None`, P&L fields set to None

## No Auth / No Multi-user
Portfolio is a single shared JSON store. No user accounts. Not suitable for multi-user deployments without adding a user layer.
