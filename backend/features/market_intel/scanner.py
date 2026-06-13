"""
Market Intelligence Scanner
============================
Ranks stocks across time horizons (1W, 1M, 3M) using a weighted composite of:
  - Options flow (PCR, unusual activity, IV skew)  — heaviest weight
  - Reversal signals (technical, macro, breadth, sentiment)
  - Smart money (institutional + insider via options flow)
  - Insider transactions (Form 4 purchases/sales)

Weight profiles per horizon
---------------------------
  1W  : options 50%  reversal 25%  smart_money 15%  insider 10%
  1M  : options 40%  reversal 30%  smart_money 20%  insider 10%
  3M  : options 25%  reversal 35%  smart_money 25%  insider 15%
"""
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

import yfinance as yf

from core import cache as _cache
from features.smart_money.signals import options as opt_sig
from features.smart_money.signals import insider as ins_sig
from features.smart_money.signals import institution as inst_sig

logger = logging.getLogger(__name__)

CACHE_TTL_SCAN = 1800     # 30 min — expensive multi-signal scan
CACHE_TTL_MARKET = 300    # 5 min — market overview tickers
MAX_WORKERS = 14

HORIZON_WEIGHTS = {
    "1w": {"options": 0.50, "reversal": 0.25, "smart_money": 0.15, "insider": 0.10},
    "1m": {"options": 0.40, "reversal": 0.30, "smart_money": 0.20, "insider": 0.10},
    "3m": {"options": 0.25, "reversal": 0.35, "smart_money": 0.25, "insider": 0.15},
}

# Curated universe: high-liquidity names with active options markets
UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    # Semiconductors
    "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "KLAC", "SMCI",
    # Software / Cloud
    "CRM", "ORCL", "NOW", "ADBE", "PLTR", "SNOW", "DDOG",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "V", "MA", "AXP",
    # Healthcare / Pharma
    "JNJ", "PFE", "ABBV", "UNH", "LLY", "AMGN", "GILD", "MRNA",
    # Energy
    "XOM", "CVX", "COP", "SLB", "OXY",
    # Consumer
    "HD", "MCD", "COST", "TGT", "WMT", "NKE", "SBUX",
    # Industrial / Defense
    "BA", "CAT", "GE", "HON", "LMT", "RTX",
    # ETFs (for breadth reads)
    "SPY", "QQQ", "IWM",
    # Media / Streaming
    "NFLX", "DIS", "SPOT",
    # Other
    "COIN", "MSTR", "UBER", "ABNB", "SHOP", "PYPL",
]

MACRO_TICKERS = {
    "SPY":    {"label": "S&P 500", "icon": "📈"},
    "QQQ":    {"label": "Nasdaq", "icon": "💻"},
    "IWM":    {"label": "Russell 2000", "icon": "📊"},
    "^VIX":   {"label": "VIX", "icon": "⚡"},
    "GC=F":   {"label": "Gold", "icon": "🥇"},
    "DX-Y.NYB": {"label": "DXY", "icon": "💵"},
    "^TNX":   {"label": "10Y Yield", "icon": "🏛️"},
    "CL=F":   {"label": "Oil", "icon": "🛢️"},
}


def _reversal_score(ticker: str) -> dict:
    """Run reversal analysis. Returns score (-1 to +1) and label."""
    try:
        from features.reversal.signals.composite import analyze_ticker
        result = analyze_ticker(ticker, explain=False, lookback_days=90)
        direction = result.direction  # "BULLISH" / "BEARISH" / "NEUTRAL"
        confidence = float(result.confidence)

        dir_str = str(direction).lower() if not isinstance(direction, str) else direction.lower()
        dir_val = getattr(direction, 'value', dir_str).lower()

        if "bullish" in dir_val:
            score = confidence
            label = f"Bullish ({int(confidence*100)}%)"
        elif "bearish" in dir_val:
            score = -confidence
            label = f"Bearish ({int(confidence*100)}%)"
        else:
            score = 0.0
            label = "Neutral"

        return {"score": round(score, 3), "label": label, "direction": dir_val, "confidence": confidence}
    except Exception as e:
        logger.debug(f"Reversal failed for {ticker}: {e}")
        return {"score": 0.0, "label": "N/A", "direction": "NEUTRAL", "confidence": 0.0}


def _price_data(ticker: str) -> dict:
    try:
        t = yf.Ticker(ticker)
        fi = t.fast_info
        spot = float(fi.last_price)
        prev = float(fi.previous_close or spot)
        change_pct = round(((spot - prev) / prev) * 100, 2) if prev else 0.0
        return {"price": round(spot, 2), "change_pct": change_pct}
    except Exception:
        return {"price": None, "change_pct": 0.0}


def _score_ticker(ticker: str, weights: dict) -> Optional[dict]:
    try:
        price_info = _price_data(ticker)
        if not price_info["price"]:
            return None

        options_data = opt_sig.score(ticker)
        insider_data = ins_sig.score(ticker)
        inst_data    = inst_sig.score(ticker)
        reversal_data = _reversal_score(ticker)

        # smart_money composite = institution + insider (same as smart_money scanner minus options)
        smart_money_score = (
            inst_data["score"] * 0.55 +
            insider_data["score"] * 0.45
        )

        composite = (
            options_data["score"]  * weights["options"] +
            reversal_data["score"] * weights["reversal"] +
            smart_money_score      * weights["smart_money"] +
            insider_data["score"]  * weights["insider"]
        )
        composite = round(max(-1.0, min(1.0, composite)), 3)

        # 0-100 score for display
        display_score = int((composite + 1) / 2 * 100)

        if composite >= 0.45:
            verdict = "Strong Buy"
            verdict_class = "strong-bull"
        elif composite >= 0.20:
            verdict = "Bullish"
            verdict_class = "bull"
        elif composite <= -0.45:
            verdict = "Strong Sell"
            verdict_class = "strong-bear"
        elif composite <= -0.20:
            verdict = "Bearish"
            verdict_class = "bear"
        else:
            verdict = "Neutral"
            verdict_class = "neutral"

        # Signal confidence bars (0-100 each, centered at 50)
        def to_bar(s):
            return int((s + 1) / 2 * 100)

        # Readable options summary
        options_label = _options_label(options_data)

        all_reasons = (
            options_data.get("reasons", []) +
            reversal_data.get("reasons", []) +
            insider_data.get("reasons", []) +
            inst_data.get("reasons", [])
        )[:5]

        return {
            "ticker": ticker,
            "price": price_info["price"],
            "change_pct": price_info["change_pct"],
            "composite_score": composite,
            "display_score": display_score,
            "verdict": verdict,
            "verdict_class": verdict_class,
            "signals": {
                "options": {
                    "score": options_data["score"],
                    "bar": to_bar(options_data["score"]),
                    "label": options_label,
                    "pcr": options_data.get("pcr"),
                    "unusual_calls": options_data.get("unusual_calls", 0),
                    "unusual_puts": options_data.get("unusual_puts", 0),
                    "iv_skew": options_data.get("iv_skew"),
                    "call_volume": options_data.get("call_volume", 0),
                    "put_volume": options_data.get("put_volume", 0),
                },
                "reversal": {
                    "score": reversal_data["score"],
                    "bar": to_bar(reversal_data["score"]),
                    "label": reversal_data["label"],
                    "direction": reversal_data["direction"],
                    "confidence": reversal_data["confidence"],
                },
                "smart_money": {
                    "score": smart_money_score,
                    "bar": to_bar(smart_money_score),
                    "label": _sm_label(smart_money_score),
                    "institution_score": inst_data["score"],
                    "insider_score": insider_data["score"],
                },
                "insider": {
                    "score": insider_data["score"],
                    "bar": to_bar(insider_data["score"]),
                    "label": _insider_label(insider_data),
                    "buy_count": insider_data.get("buy_count", 0),
                    "sell_count": insider_data.get("sell_count", 0),
                    "net_value": insider_data.get("net_value", 0),
                },
            },
            "top_reasons": all_reasons,
            "weights": weights,
        }
    except Exception as e:
        logger.debug(f"Score failed for {ticker}: {e}")
        return None


def _options_label(d: dict) -> str:
    score = d.get("score", 0)
    pcr = d.get("pcr")
    uc = d.get("unusual_calls", 0)
    up = d.get("unusual_puts", 0)
    parts = []
    if pcr is not None:
        if pcr < 0.6:
            parts.append(f"PCR {pcr:.2f} (calls dominate)")
        elif pcr > 1.2:
            parts.append(f"PCR {pcr:.2f} (puts dominate)")
        else:
            parts.append(f"PCR {pcr:.2f}")
    if uc > 1:
        parts.append(f"{uc} unusual call strikes")
    if up > 1:
        parts.append(f"{up} unusual put strikes")
    if not parts:
        parts.append("Bullish" if score > 0.1 else "Bearish" if score < -0.1 else "Neutral")
    return " · ".join(parts)


def _sm_label(score: float) -> str:
    if score > 0.4:
        return "Strong institutional buying"
    if score > 0.15:
        return "Institutional accumulation"
    if score < -0.4:
        return "Institutional distribution"
    if score < -0.15:
        return "Mild selling pressure"
    return "Mixed / neutral"


def _insider_label(d: dict) -> str:
    bc = d.get("buy_count", 0)
    sc = d.get("sell_count", 0)
    nv = d.get("net_value", 0)
    if bc == 0 and sc == 0:
        return "No recent transactions"
    if bc > sc:
        return f"{bc} purchase{'s' if bc>1 else ''} (${abs(nv)/1e6:.1f}M net buy)"
    if sc > bc:
        return f"{sc} sale{'s' if sc>1 else ''} (${abs(nv)/1e6:.1f}M net sell)"
    return f"{bc} buys / {sc} sells"


def run_scan(horizon: str = "1m", tickers: Optional[list] = None) -> dict:
    if horizon not in HORIZON_WEIGHTS:
        horizon = "1m"
    weights = HORIZON_WEIGHTS[horizon]
    universe = tickers or UNIVERSE

    cache_key = f"market_intel:{horizon}:{'_'.join(sorted(universe))}"
    cached = _cache.get(cache_key, CACHE_TTL_SCAN)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_score_ticker, t, weights): t for t in universe}
        for future in as_completed(futures):
            r = future.result()
            if r:
                results.append(r)

    results.sort(key=lambda r: r["composite_score"], reverse=True)

    bullish = [r for r in results if r["composite_score"] > 0.05][:15]
    bearish = [r for r in reversed(results) if r["composite_score"] < -0.05][:15]
    neutral = [r for r in results if -0.05 <= r["composite_score"] <= 0.05][:5]

    output = {
        "horizon": horizon,
        "weights": weights,
        "scanned": len(results),
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "bullish": bullish,
        "bearish": bearish,
        "neutral": neutral,
    }
    _cache.set(cache_key, output)
    return output


def get_market_overview() -> dict:
    cache_key = "market_intel:overview"
    cached = _cache.get(cache_key, CACHE_TTL_MARKET)
    if cached:
        return cached

    tickers = {}
    for sym, meta in MACRO_TICKERS.items():
        try:
            t = yf.Ticker(sym)
            fi = t.fast_info
            price = float(fi.last_price)
            prev = float(fi.previous_close or price)
            change_pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
            tickers[sym] = {
                "symbol": sym,
                "label": meta["label"],
                "icon": meta["icon"],
                "price": round(price, 2),
                "change_pct": change_pct,
            }
        except Exception:
            tickers[sym] = {"symbol": sym, "label": meta["label"], "icon": meta["icon"],
                            "price": None, "change_pct": 0.0}

    result = {
        "tickers": list(tickers.values()),
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }
    _cache.set(cache_key, result)
    return result
