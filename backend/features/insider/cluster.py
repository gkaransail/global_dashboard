"""
Cluster buying detector.
Scans the same universe as smart_money scanner.
A cluster = 2+ distinct insiders buying in any 30-day rolling window.
Score = num_insiders * log(total_value) / 10, clamped 0-1.
"""
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, timedelta
from typing import Optional

from features.insider.fetcher import fetch_transactions
from core import cache as _cache

logger = logging.getLogger(__name__)

CLUSTER_CACHE_TTL = 7200  # 2 hours

UNIVERSE = [
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


def _find_clusters(transactions: list[dict], min_insiders: int, window_days: int) -> list[dict]:
    """
    Given a list of Buy transactions, find windows where >= min_insiders bought.
    Returns a list of cluster windows with insider details.
    """
    buys = [t for t in transactions if t["transaction_type"] == "Buy"]
    if len(buys) < min_insiders:
        return []

    # Parse dates
    dated = []
    for tx in buys:
        try:
            d = datetime.strptime(tx["date"], "%Y-%m-%d").date() if tx["date"] else None
        except ValueError:
            d = None
        if d:
            dated.append((d, tx))

    if len(dated) < min_insiders:
        return []

    dated.sort(key=lambda x: x[0])

    clusters = []
    checked = set()

    for i, (start_date, _) in enumerate(dated):
        window_end = start_date + timedelta(days=window_days)
        in_window = [(d, tx) for (d, tx) in dated if start_date <= d <= window_end]

        # Unique insiders in this window
        insiders_in_window = {}
        for d, tx in in_window:
            name = tx["insider_name"]
            if name not in insiders_in_window:
                insiders_in_window[name] = tx
            else:
                # Keep the highest-value transaction per insider
                if tx["value"] > insiders_in_window[name]["value"]:
                    insiders_in_window[name] = tx

        if len(insiders_in_window) >= min_insiders:
            key = frozenset(insiders_in_window.keys())
            if key in checked:
                continue
            checked.add(key)

            total_value = sum(tx["value"] for tx in insiders_in_window.values())
            total_shares = sum(tx["shares"] for tx in insiders_in_window.values())

            # Score: insiders * log(value) / 10, clamped 0-1
            if total_value > 0:
                raw_score = len(insiders_in_window) * math.log(max(total_value, 1)) / 10.0
            else:
                raw_score = 0.0
            score = round(min(1.0, max(0.0, raw_score)), 3)

            # Calculate window span
            dates_in_window = [d for (d, _) in in_window if d in [
                datetime.strptime(tx["date"], "%Y-%m-%d").date()
                for tx in insiders_in_window.values()
            ]]
            if len(dates_in_window) > 1:
                span_days = (max(dates_in_window) - min(dates_in_window)).days
            else:
                span_days = 0

            cluster_transactions = []
            for name, tx in insiders_in_window.items():
                cluster_transactions.append({
                    "insider_name": name,
                    "title": tx.get("title", ""),
                    "value": tx["value"],
                    "shares": tx["shares"],
                    "date": tx["date"],
                })
            cluster_transactions.sort(key=lambda x: x["value"], reverse=True)

            clusters.append({
                "score": score,
                "insider_count": len(insiders_in_window),
                "total_value": round(total_value),
                "total_shares": total_shares,
                "span_days": span_days,
                "window_start": str(start_date),
                "transactions": cluster_transactions,
            })

    # Return the best cluster (highest score) for this ticker
    return sorted(clusters, key=lambda c: c["score"], reverse=True)[:1]


def _scan_ticker(ticker: str, min_insiders: int, days: int, window_days: int = 30) -> Optional[dict]:
    """Scan a single ticker for cluster buying. Returns cluster dict or None."""
    try:
        transactions = fetch_transactions(ticker, days=days)
        clusters = _find_clusters(transactions, min_insiders, window_days)
        if not clusters:
            return None

        best = clusters[0]

        # Enrich with current price info
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            spot = float(t.fast_info.last_price)
            prev = float(t.fast_info.previous_close or spot)
            change_pct = round(((spot - prev) / prev) * 100, 2) if prev else 0.0
        except Exception:
            spot = 0.0
            change_pct = 0.0

        return {
            "ticker": ticker,
            "price": round(spot, 2),
            "change_pct": change_pct,
            "cluster_score": best["score"],
            "insider_count": best["insider_count"],
            "total_value": best["total_value"],
            "total_shares": best["total_shares"],
            "span_days": best["span_days"],
            "window_start": best["window_start"],
            "transactions": best["transactions"],
        }
    except Exception as e:
        logger.debug(f"Cluster scan failed for {ticker}: {e}")
        return None


def run_cluster_scan(min_insiders: int = 2, days: int = 60, window_days: int = 30) -> dict:
    """
    Scan the universe for insider cluster buying.
    Returns top 20 results ranked by cluster_score.
    Results are cached for 2 hours.
    """
    cache_key = f"insider_cluster_{min_insiders}_{days}_{window_days}"
    cached = _cache.get(cache_key, ttl=CLUSTER_CACHE_TTL)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(_scan_ticker, ticker, min_insiders, days, window_days): ticker
            for ticker in UNIVERSE
        }
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    results.sort(key=lambda r: r["cluster_score"], reverse=True)
    top = results[:20]

    output = {
        "scanned": len(UNIVERSE),
        "clusters_found": len(results),
        "min_insiders": min_insiders,
        "days": days,
        "window_days": window_days,
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "results": top,
    }

    _cache.set(cache_key, output)
    return output
