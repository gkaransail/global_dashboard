"""
Global Dashboard MCP Server.

Exposes this dashboard's analysis, backtest data, and federation tools as MCP tools
so Claude Code (or any MCP client) can call them — including tools on a peer's dashboard.

Mount into FastAPI:
    from mcp_server import mcp
    app.mount("/mcp", mcp.sse_app())

Then in Claude Code config (~/.claude/mcp.json):
    {
      "servers": {
        "my-dashboard": {
          "transport": "sse",
          "url": "http://localhost:8000/mcp/sse"
        },
        "friend-dashboard": {
          "transport": "sse",
          "url": "https://<friend-ngrok-url>/mcp/sse"
        }
      }
    }

Or via CLI:
    claude mcp add my-dashboard --transport sse --url http://localhost:8000/mcp/sse
    claude mcp add friend-dashboard --transport sse --url https://<ngrok>/mcp/sse
"""
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    name="Global Dashboard",
    instructions=(
        "Financial intelligence dashboard tools. "
        "Use analyze_ticker to get options signals for any stock. "
        "Use compare_with_peer to see how a peer dashboard rates the same stock. "
        "Use sync_peer_predictions + run_rl_training to improve the model with pooled data. "
        "Use merge_peer_weights for federated learning across two dashboards."
    ),
)

_TIMEOUT = 15.0


# ── Local tools ───────────────────────────────────────────────────────────────

@mcp.tool()
def analyze_ticker(ticker: str, timeframe: str = "1mo") -> dict:
    """
    Get this dashboard's full options analysis for a ticker.
    Returns: spot price, P/C ratio, IV rank, max pain, expected move,
             GEX environment, squeeze candidate, and directional narrative.
    """
    from features.options.analyzers.analysis import get_analysis
    try:
        data = get_analysis(ticker.upper(), timeframe=timeframe)
        return {
            "ticker":       data.get("ticker"),
            "spot_price":   data.get("spot_price"),
            "timeframe":    timeframe,
            "pc_atm_ratio": data.get("pc_atm_ratio"),
            "pc_vol_ratio": data.get("pc_vol_ratio"),
            "iv_rank":      data.get("iv_rank"),
            "atm_iv_pct":   data.get("atm_iv_pct"),
            "max_pain":     data.get("max_pain"),
            "expected_move": data.get("expected_move"),
            "squeeze":      data.get("squeeze_candidate"),
            "gex":          (data.get("gex") or {}).get("environment"),
            "flow":         data.get("options_flow_significance"),
            "narrative":    data.get("narrative"),
        }
    except Exception as e:
        return {"error": str(e), "ticker": ticker}


@mcp.tool()
def get_signal_weights() -> dict:
    """
    Get this dashboard's current RL signal weights.
    Returns each signal's weight, base weight, accuracy, and sample count.
    Weights above base = signal is performing well. Below base = underperforming.
    """
    from features.backtest import rl
    weights = rl.get_weights_summary()
    return {
        "weights":    weights,
        "weight_map": {w["signal"]: w["weight"] for w in weights},
    }


@mcp.tool()
def get_backtest_stats() -> dict:
    """
    Get this dashboard's prediction accuracy stats.
    Returns win rate, bull/bear win rates, avg return, and per-timeframe breakdown.
    """
    from features.backtest.db import init_db, get_stats
    init_db()
    return get_stats()


@mcp.tool()
def get_screener_results(limit: int = 20) -> dict:
    """
    Get this dashboard's top multi-factor screener picks.
    Returns bullish and bearish ranked stocks scored on technical,
    smart money, fundamental, and sentiment factors.
    """
    try:
        from features.screener.engine import run_scan
        data = run_scan()
        results = data.get("results", [])
        return {
            "bullish": [r for r in results if r.get("composite_score", 50) > 50][:limit],
            "bearish": [r for r in results if r.get("composite_score", 50) < 50][:limit],
            "scanned_at": data.get("scanned_at"),
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def get_reversal_signal(ticker: str, lookback_days: int = 90) -> dict:
    """
    Get the reversal signal (bullish/bearish/neutral + confidence) for a ticker.
    """
    try:
        from features.reversal.signals.composite import analyze_ticker
        result = analyze_ticker(ticker.upper(), explain=True, lookback_days=lookback_days)
        return result.model_dump()
    except Exception as e:
        return {"error": str(e), "ticker": ticker}


# ── Federation tools (peer comparison + learning) ────────────────────────────

@mcp.tool()
async def compare_with_peer(ticker: str, peer_url: str, timeframe: str = "1mo") -> dict:
    """
    Compare this dashboard's analysis of a ticker with a peer dashboard's analysis.
    Reveals where the two models agree or disagree — disagreements are uncertainty,
    agreements are higher-confidence signals.

    peer_url: base URL of the peer dashboard, e.g. https://abc123.ngrok.io
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(
                f"{peer_url.rstrip('/')}/api/v1/federation/compare/{ticker.upper()}",
                params={"peer_url": "self", "timeframe": timeframe}
            )
        except Exception:
            pass

        # Fetch local + peer analysis in parallel
        try:
            local_resp  = await client.get(f"http://localhost:8000/api/v1/federation/analysis/{ticker.upper()}",
                                           params={"timeframe": timeframe})
            peer_resp   = await client.get(f"{peer_url.rstrip('/')}/api/v1/federation/analysis/{ticker.upper()}",
                                           params={"timeframe": timeframe})
            local = local_resp.json()
            peer  = peer_resp.json()
        except Exception as e:
            return {"error": f"Could not fetch analysis: {e}"}

    # Compare key fields
    fields = ["pc_atm_ratio", "iv_rank", "atm_iv_pct", "direction", "squeeze", "gex_environment", "options_flow"]
    comparison = {}
    disagreements = []
    for f in fields:
        lv, pv = local.get(f), peer.get(f)
        comparison[f] = {"local": lv, "peer": pv}
        if lv != pv and not (lv is None and pv is None):
            if isinstance(lv, (int, float)) and isinstance(pv, (int, float)):
                if abs(lv - pv) > 0.05 * max(abs(lv), abs(pv), 1):
                    disagreements.append(f)
            else:
                disagreements.append(f)

    return {
        "ticker":            ticker.upper(),
        "timeframe":         timeframe,
        "verdict":           "agree" if local.get("direction") == peer.get("direction") else "disagree",
        "direction_local":   local.get("direction"),
        "direction_peer":    peer.get("direction"),
        "disagreements":     disagreements,
        "comparison":        comparison,
        "local_weights":     local.get("signal_weights"),
        "peer_weights":      peer.get("signal_weights"),
    }


@mcp.tool()
async def sync_peer_predictions(peer_url: str, limit: int = 500) -> dict:
    """
    Import evaluated predictions from a peer dashboard into this one.
    More training data improves the RL optimizer's signal weights.
    Skips duplicates automatically.

    peer_url: base URL of the peer, e.g. https://abc123.ngrok.io
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{peer_url.rstrip('/')}/api/v1/federation/predictions/export",
                params={"limit": limit}
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            return {"error": f"Could not fetch predictions from peer: {e}"}

    predictions = data.get("predictions", [])

    # Import locally via the federation import endpoint
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            import_resp = await client.post(
                "http://localhost:8000/api/v1/federation/predictions/import",
                json={"predictions": predictions, "peer_url": peer_url}
            )
            result = import_resp.json()
        except Exception as e:
            return {"error": f"Import failed: {e}"}

    return {
        "peer_url":   peer_url,
        "fetched":    len(predictions),
        "imported":   result.get("imported"),
        "skipped":    result.get("skipped"),
        "errors":     result.get("errors"),
        "tip":        "Run run_rl_training() next to update signal weights with the pooled data.",
    }


@mcp.tool()
async def merge_peer_weights(peer_url: str) -> dict:
    """
    Federated weight averaging: merge this dashboard's RL signal weights
    with a peer's weights, proportional to each dashboard's sample count.
    No raw data is shared — only the learned weights.

    peer_url: base URL of the peer, e.g. https://abc123.ngrok.io
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.post(
                "http://localhost:8000/api/v1/federation/weights/merge",
                json={"peer_url": peer_url}
            )
            return resp.json()
        except Exception as e:
            return {"error": f"Weight merge failed: {e}"}


@mcp.tool()
def run_rl_training() -> dict:
    """
    Run the RL weight optimizer over all evaluated predictions (including any
    recently imported from a peer). Updates signal weights in place.
    Run after sync_peer_predictions for best results.
    """
    from features.backtest import rl
    return rl.run_rl_update()


@mcp.tool()
async def ping_peer(peer_url: str) -> dict:
    """
    Check if a peer dashboard is reachable and get its status summary.
    peer_url: base URL of the peer, e.g. https://abc123.ngrok.io
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(f"{peer_url.rstrip('/')}/api/v1/federation/status")
            resp.raise_for_status()
            return {"reachable": True, **resp.json()}
        except Exception as e:
            return {"reachable": False, "error": str(e), "peer_url": peer_url}
