"""
13F institutional holdings analysis using yfinance (sourced from SEC 13F filings).
Provides top holders, position changes, accumulation/distribution flow, and screener.
"""
import logging
from typing import Optional
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour — 13F data updates quarterly


def get_holders(ticker: str) -> dict:
    cache_key = f"institutional_holders_{ticker}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    ticker = ticker.upper()
    t = yf.Ticker(ticker)

    # Major holders summary
    inst_pct = 0.0
    insider_pct = 0.0
    try:
        major = t.major_holders
        if major is not None and not major.empty:
            for idx, row in major.iterrows():
                label = str(row.get("Value", "") or "").lower()
                val_str = str(idx) if isinstance(idx, (int, float)) else ""
                # yfinance returns major_holders as a 2-col df: value, description
                pass
            # Try direct column access
            if "Value" in major.columns and "Breakdown" in major.columns:
                for _, row in major.iterrows():
                    desc = str(row.get("Breakdown", "")).lower()
                    try:
                        val = float(str(row.get("Value", "0")).replace("%", "").strip()) / 100
                    except Exception:
                        val = 0.0
                    if "institution" in desc:
                        inst_pct = val
                    elif "insider" in desc:
                        insider_pct = val
            elif len(major.columns) >= 2:
                for _, row in major.iterrows():
                    desc = str(row.iloc[1]).lower()
                    try:
                        val = float(str(row.iloc[0]).replace("%", "").strip()) / 100
                    except Exception:
                        val = 0.0
                    if "institution" in desc:
                        inst_pct = val
                    elif "insider" in desc:
                        insider_pct = val
    except Exception as e:
        logger.debug(f"major_holders failed for {ticker}: {e}")

    # Top institutional holders with position changes
    holders = []
    buying = []
    selling = []
    new_positions = []
    closed_positions = []

    try:
        inst = t.institutional_holders
        if inst is not None and not inst.empty:
            for _, row in inst.iterrows():
                name = str(row.get("Holder", ""))
                shares = int(row.get("Shares", 0) or 0)
                pct_out = float(row.get("% Out", 0) or 0)
                pct_change = float(row.get("pctChange", 0) or 0)
                date_rep = str(row.get("Date Reported", ""))[:10]

                entry = {
                    "name": name,
                    "shares": shares,
                    "pct_outstanding": round(pct_out * 100, 2),
                    "pct_change": round(pct_change * 100, 2),
                    "date_reported": date_rep,
                    "action": _classify_action(pct_change),
                }
                holders.append(entry)

                if pct_change >= 0.95:
                    new_positions.append(name)
                elif pct_change <= -0.95:
                    closed_positions.append(name)
                elif pct_change > 0.05:
                    buying.append({"name": name, "change": round(pct_change * 100, 2)})
                elif pct_change < -0.05:
                    selling.append({"name": name, "change": round(pct_change * 100, 2)})
    except Exception as e:
        logger.debug(f"institutional_holders failed for {ticker}: {e}")

    # Net flow score: positive = net buying, negative = net selling
    all_changes = [h["pct_change"] for h in holders if h["pct_change"] != 0]
    avg_change = sum(all_changes) / len(all_changes) if all_changes else 0.0
    net_flow = "accumulating" if avg_change > 1.0 else "distributing" if avg_change < -1.0 else "neutral"

    # Current price + value at last 13F report
    current_price = None
    try:
        current_price = round(float(t.fast_info.last_price), 2)
    except Exception:
        pass
    for h in holders:
        h["current_price"] = current_price
        if current_price and h["shares"]:
            h["current_value"] = round(current_price * h["shares"])

    result = {
        "ticker": ticker,
        "current_price": current_price,
        "ownership": {
            "institutional_pct": round(inst_pct * 100, 1),
            "insider_pct": round(insider_pct * 100, 1),
        },
        "holders": holders[:20],
        "flow": {
            "net_flow": net_flow,
            "avg_position_change_pct": round(avg_change, 2),
            "buying": buying[:5],
            "selling": selling[:5],
            "new_positions": new_positions[:5],
            "closed_positions": closed_positions[:5],
        },
        "summary": {
            "total_holders": len(holders),
            "buyers_count": len(buying) + len(new_positions),
            "sellers_count": len(selling) + len(closed_positions),
        },
    }

    _cache.set(cache_key, result)
    return result


def _classify_action(pct_change: float) -> str:
    if pct_change >= 0.95:
        return "new"
    if pct_change <= -0.95:
        return "closed"
    if pct_change > 0.10:
        return "adding"
    if pct_change < -0.10:
        return "trimming"
    return "holding"


from concurrent.futures import ThreadPoolExecutor, as_completed as _as_completed
from datetime import date as _date, timedelta as _timedelta

SCREENER_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "KLAC",
    "CRM", "ORCL", "NOW", "ADBE", "PLTR", "SNOW",
    "JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "V", "MA", "AXP",
    "JNJ", "PFE", "ABBV", "UNH", "LLY", "AMGN", "GILD", "MRNA",
    "XOM", "CVX", "COP", "SLB", "OXY",
    "HD", "MCD", "COST", "TGT", "WMT", "NKE", "SBUX",
    "BA", "CAT", "GE", "HON", "LMT", "RTX",
    "NFLX", "DIS", "SPOT",
    "F", "GM", "RIVN",
    "COIN", "MSTR", "UBER", "ABNB", "SHOP", "PYPL",
]


def run_screener(min_inst_pct: float = 50.0, flow: str = "all", days: int = 365) -> list[dict]:
    cache_key = f"institutional_screener_{min_inst_pct}_{flow}_{days}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    cutoff = (_date.today() - _timedelta(days=days)).isoformat()
    results = []

    def _check(ticker: str):
        try:
            data = get_holders(ticker)
            inst_pct = data["ownership"]["institutional_pct"]
            avg_change = data["flow"]["avg_position_change_pct"]
            net_flow = data["flow"]["net_flow"]

            if inst_pct < min_inst_pct:
                return None
            if flow == "accumulating" and net_flow != "accumulating":
                return None
            if flow == "distributing" and net_flow != "distributing":
                return None

            # Recency filter: at least one holder must have a recent filing
            most_recent = max(
                (h["date_reported"] for h in data["holders"] if h.get("date_reported")),
                default=""
            )
            if most_recent and most_recent < cutoff:
                return None

            return {
                "ticker": ticker,
                "institutional_pct": inst_pct,
                "avg_change_pct": avg_change,
                "net_flow": net_flow,
                "buyer_count": data["summary"]["buyers_count"],
                "seller_count": data["summary"]["sellers_count"],
                "last_filing": most_recent,
            }
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = [pool.submit(_check, t) for t in SCREENER_UNIVERSE]
        for f in _as_completed(futs):
            r = f.result()
            if r:
                results.append(r)

    results.sort(key=lambda r: r["avg_change_pct"], reverse=True)
    _cache.set(cache_key, results)
    return results
