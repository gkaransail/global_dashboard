# Federation — Developer Reference

## Purpose

Connects two independent dashboards so they can compare options signals, pool evaluated prediction data, and merge RL signal weights — improving model accuracy without sharing raw user data.

---

## File Structure

```
backend/
├── features/federation/
│   ├── __init__.py
│   ├── manifest.py          # Feature registration
│   └── router.py            # REST federation endpoints
├── mcp_server.py            # FastMCP server (mounted at /mcp)
└── main.py                  # mounts /mcp via mcp.sse_app()
frontend/
└── src/features/backtest/index.jsx   # FederationPanel component
```

---

## Architecture

Two layers work together:

**Layer 1 — REST Federation API** (`/api/v1/federation/*`)
Direct peer-to-peer HTTP calls. Peers call each other's REST endpoints to export/import predictions and weights. No auth — designed for trusted peers over ngrok/Tailscale.

**Layer 2 — MCP Server** (`/mcp/sse`)
Exposes tools to Claude Code (or any MCP client). MCP tools internally call the REST API, so Claude can orchestrate federation tasks conversationally.

---

## REST Endpoints

### `GET /api/v1/federation/status`
Health + capability handshake. Peers call this to verify connectivity before sync.

**Response:**
```json
{
  "status": "ok",
  "dashboard": "global_dashboard",
  "timestamp": "2026-06-17T...",
  "capabilities": ["analysis", "weights", "predictions", "compare", "merge_weights"],
  "stats": { "total_predictions": 72, "evaluated": 72, "win_rate_pct": 11.1 },
  "signal_count": 10
}
```

---

### `GET /api/v1/federation/analysis/{ticker}`

**Query params:** `timeframe` (default `1mo`)

Returns a shareable analysis snapshot including current signal weights. Used by `compare`.

**Response fields:** `ticker`, `spot_price`, `direction`, `score_label`, `pc_atm_ratio`, `pc_vol_ratio`, `iv_rank`, `atm_iv_pct`, `max_pain`, `expected_move`, `squeeze`, `gex_environment`, `options_flow`, `signal_weights`, `timestamp`

---

### `GET /api/v1/federation/weights`

Exports signal weights with per-signal accuracy and sample counts.

**Response:**
```json
{
  "weights": {
    "iv_rank": { "weight": 1.2, "sample_count": 45, "accuracy": 0.62 },
    ...
  },
  "timestamp": "..."
}
```

---

### `GET /api/v1/federation/predictions/export`

**Query params:** `limit` (1–2000, default 500)

Exports evaluated predictions stripped of internal `id` fields. Peer imports these.

---

### `POST /api/v1/federation/predictions/import`

**Body:**
```json
{ "predictions": [...], "peer_url": "https://abc.ngrok.io" }
```

Imports predictions with deduplication on `(ticker, timeframe, predicted_at)`. Sets `source = "peer:{peer_url}"` on each imported row. Only imports predictions that have `evaluated=true` and `actual_return_pct` set.

After inserting, immediately marks the prediction as evaluated (so RL training can use it right away).

---

### `POST /api/v1/federation/weights/merge`

**Body:** `{ "peer_url": "https://abc.ngrok.io" }`

Fetches peer weights, merges using sample-count-weighted averaging:

```
merged_w = (local_w × local_n + peer_w × peer_n) / (local_n + peer_n)
merged_w = clamp(merged_w, 0.1, 5.0)
```

Writes merged weights + merged accuracy back to `signal_weights` table. Returns a `changes` dict showing before/after for each signal that shifted.

---

### `GET /api/v1/federation/compare/{ticker}`

**Query params:** `peer_url` (required), `timeframe` (default `1mo`)

Calls local `shareable_analysis()` + fetches peer's `/api/v1/federation/analysis/{ticker}`. Detects disagreements:
- Numeric fields: disagreement if `|local - peer| > 0.05 × max(|local|, |peer|, 1)`
- String/bool fields: disagreement if `local != peer`

**Response:** `local`, `peer`, `disagreements` list, `verdict` ("agree"/"disagree"), `direction_agree` bool.

---

## MCP Server (`mcp_server.py`)

Uses `mcp 1.28.0` with `FastMCP`. Mounted in `main.py`:

```python
from mcp_server import mcp
app.mount("/mcp", mcp.sse_app())
```

Claude Code connects via SSE:
```bash
claude mcp add my-dashboard --transport sse --url http://localhost:8000/mcp/sse
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `analyze_ticker(ticker, timeframe)` | Full options analysis for a ticker |
| `get_signal_weights()` | Current RL weights with accuracy + sample count |
| `get_backtest_stats()` | Win rate, bull/bear accuracy, avg return |
| `get_screener_results(limit)` | Top bullish/bearish screener picks |
| `get_reversal_signal(ticker, lookback_days)` | Reversal direction + confidence |
| `compare_with_peer(ticker, peer_url, timeframe)` | Side-by-side signal comparison |
| `sync_peer_predictions(peer_url, limit)` | Import peer's evaluated predictions |
| `merge_peer_weights(peer_url)` | Federated weight averaging |
| `run_rl_training()` | Re-run RL optimizer (use after sync) |
| `ping_peer(peer_url)` | Check if peer is reachable |

---

## Data Flow: Federated Learning

```
Dashboard A                          Dashboard B
──────────────────────               ──────────────────────
predictions table                    predictions table
signal_weights table                 signal_weights table
     │                                     │
     │  GET /predictions/export            │
     │◄────────────────────────────────────┤
     │                                     │
     │  POST /predictions/import           │
     ├────────────────────────────────────►│
     │                                     │
     │  POST /weights/merge                │
     ├────────────────────────────────────►│  (B fetches A's weights, merges)
     │                                     │
     │  run_rl_training()                  │  run_rl_training()
     │  (uses pooled data)                 │  (uses pooled data)
```

No raw price data or user data is shared — only evaluated prediction records (ticker, direction, return_pct, correct) and learned weight scalars.

---

## Database

Uses the existing `backtest.db`. The `source` column on `predictions` tracks origin:

| source value | meaning |
|---|---|
| `options_analysis` | User ran analysis in the dashboard |
| `watchlist` | Scheduled watchlist scan |
| `peer:https://...` | Imported from that peer dashboard |

The `signal_weights` table is shared — federation weight merges write directly to it.

---

## Running Locally

Backend starts with the MCP server automatically:
```bash
cd backend && uvicorn main:app --reload --port 8000
```

Expose to peer via ngrok:
```bash
ngrok http 8000
# Share the https://<id>.ngrok.io URL with your peer
```

Peer registers your dashboard in their Claude Code:
```bash
claude mcp add friend-dashboard --transport sse --url https://<id>.ngrok.io/mcp/sse
```

---

## Adding New MCP Tools

Add a `@mcp.tool()` decorated function in `mcp_server.py`. FastMCP auto-registers it. The function's docstring becomes the tool description shown to Claude.

```python
@mcp.tool()
def my_tool(param: str) -> dict:
    """What this tool does — shown to Claude."""
    from features.myfeature.module import do_thing
    return do_thing(param)
```
