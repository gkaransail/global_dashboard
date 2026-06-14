"""
Congress Tracker API router.

Endpoints:
  GET /feed      — Paginated trade feed with filters
  GET /members   — Top members ranked by activity
  GET /tickers   — Hot tickers with congressional activity
  GET /summary   — Overall summary statistics
"""
import logging
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from features.congress import fetcher
from core import cache as _cache

router = APIRouter()
logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour


def _batch_current_prices(tickers: list[str]) -> dict[str, float | None]:
    """Fetch current prices for a list of tickers via yfinance. Cached 5 min."""
    unique = sorted({t for t in tickers if t})
    if not unique:
        return {}
    cache_key = f"congress:prices:{','.join(unique[:30])}"
    cached = _cache.get(cache_key, 300)
    if cached:
        return cached
    prices: dict[str, float | None] = {}
    for ticker in unique:
        try:
            prices[ticker] = round(float(yf.Ticker(ticker).fast_info.last_price), 2)
        except Exception:
            prices[ticker] = None
    _cache.set(cache_key, prices)
    return prices


def _cutoff_date(days: int) -> str:
    return (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')


def _filter_trades(trades: list[dict], days: int, ticker: str | None, chamber: str, transaction_type: str) -> list[dict]:
    """Apply common filters to a list of trades."""
    cutoff = _cutoff_date(days)
    result = []
    for t in trades:
        tx_date = t.get('transaction_date', '')
        if tx_date and tx_date < cutoff:
            continue
        if ticker:
            if t.get('ticker', '').upper() != ticker.upper():
                continue
        if chamber and chamber.lower() != 'all':
            if t.get('chamber', '').lower() != chamber.lower():
                continue
        if transaction_type and transaction_type.lower() != 'all':
            if t.get('transaction_type', '').lower() != transaction_type.lower():
                continue
        result.append(t)
    return result


@router.get("/feed")
async def trade_feed(
    days: int = Query(90, ge=1, le=365, description="Look-back window in days"),
    ticker: str | None = Query(None, description="Filter to a specific ticker"),
    chamber: str = Query('all', description="Filter by chamber: house / senate / all"),
    transaction_type: str = Query('all', description="Filter by type: Purchase / Sale / all"),
    limit: int = Query(100, ge=1, le=500, description="Maximum trades to return"),
):
    """
    Paginated congressional trade feed.
    Returns up to `limit` trades matching the given filters, sorted by transaction_date descending.
    """
    cache_key = f"congress:feed:{days}:{ticker or ''}:{chamber}:{transaction_type}:{limit}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached is not None:
        return cached

    try:
        all_trades = await fetcher.fetch_all_trades()
    except Exception as exc:
        logger.error(f"Feed fetch error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    filtered = _filter_trades(all_trades, days, ticker, chamber, transaction_type)
    total = len(filtered)
    page = filtered[:limit]

    # Enrich with live current prices
    unique_tickers = [t["ticker"] for t in page if t.get("ticker")]
    prices = _batch_current_prices(unique_tickers)
    for trade in page:
        trade["current_price"] = prices.get(trade.get("ticker"))

    result = {
        "days": days,
        "total": total,
        "count": len(page),
        "filters": {
            "ticker": ticker,
            "chamber": chamber,
            "transaction_type": transaction_type,
        },
        "trades": page,
    }
    _cache.set(cache_key, result)
    return result


@router.get("/members")
async def top_members(
    days: int = Query(90, ge=1, le=365, description="Look-back window in days"),
    limit: int = Query(20, ge=1, le=100, description="Number of members to return"),
):
    """
    Top congressional traders ranked by total trades count and total disclosed value.
    Returns member stats including purchase/sale breakdown and tickers traded.
    """
    cache_key = f"congress:members:{days}:{limit}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached is not None:
        return cached

    try:
        all_trades = await fetcher.fetch_all_trades()
    except Exception as exc:
        logger.error(f"Members fetch error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    filtered = _filter_trades(all_trades, days, None, 'all', 'all')

    # Aggregate by member
    member_map: dict[str, dict] = {}
    for trade in filtered:
        member = trade.get('member', 'Unknown')
        if not member:
            continue
        if member not in member_map:
            member_map[member] = {
                'member': member,
                'chamber': trade.get('chamber', ''),
                'party': trade.get('party', ''),
                'state': trade.get('state', ''),
                'total_trades': 0,
                'purchase_count': 0,
                'sale_count': 0,
                'total_value_min': 0,
                'tickers_traded': set(),
            }
        entry = member_map[member]
        entry['total_trades'] += 1
        tx_type = trade.get('transaction_type', '')
        if tx_type == 'Purchase':
            entry['purchase_count'] += 1
        elif tx_type == 'Sale':
            entry['sale_count'] += 1
        entry['total_value_min'] += trade.get('amount_min', 0) or 0
        ticker = trade.get('ticker', '')
        if ticker:
            entry['tickers_traded'].add(ticker)

        # Keep most recent party/state if previously empty
        if not entry['party'] and trade.get('party'):
            entry['party'] = trade.get('party', '')
        if not entry['state'] and trade.get('state'):
            entry['state'] = trade.get('state', '')

    # Convert sets to sorted lists
    members = []
    for entry in member_map.values():
        entry['tickers_traded'] = sorted(entry['tickers_traded'])
        members.append(entry)

    # Sort by total_trades desc, then total_value_min desc
    members.sort(key=lambda m: (m['total_trades'], m['total_value_min']), reverse=True)
    top = members[:limit]

    result = {
        "days": days,
        "total_members": len(members),
        "count": len(top),
        "members": top,
    }
    _cache.set(cache_key, result)
    return result


@router.get("/tickers")
async def hot_tickers(
    days: int = Query(90, ge=1, le=365, description="Look-back window in days"),
    limit: int = Query(30, ge=1, le=100, description="Number of tickers to return"),
):
    """
    Tickers with the most congressional trading activity.
    Includes purchase/sale breakdown, member list, and a bullish/bearish/mixed sentiment signal.
    """
    cache_key = f"congress:tickers:{days}:{limit}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached is not None:
        return cached

    try:
        all_trades = await fetcher.fetch_all_trades()
    except Exception as exc:
        logger.error(f"Tickers fetch error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    filtered = _filter_trades(all_trades, days, None, 'all', 'all')

    # Aggregate by ticker
    ticker_map: dict[str, dict] = {}
    for trade in filtered:
        ticker = trade.get('ticker', '')
        if not ticker:
            continue
        if ticker not in ticker_map:
            ticker_map[ticker] = {
                'ticker': ticker,
                'total_trades': 0,
                'purchase_count': 0,
                'sale_count': 0,
                'members': set(),
                'total_value_min': 0,
            }
        entry = ticker_map[ticker]
        entry['total_trades'] += 1
        tx_type = trade.get('transaction_type', '')
        if tx_type == 'Purchase':
            entry['purchase_count'] += 1
        elif tx_type == 'Sale':
            entry['sale_count'] += 1
        member = trade.get('member', '')
        if member:
            entry['members'].add(member)
        entry['total_value_min'] += trade.get('amount_min', 0) or 0

    # Calculate sentiment and convert sets
    tickers = []
    for entry in ticker_map.values():
        buy = entry['purchase_count']
        sell = entry['sale_count']
        if buy > sell * 1.5:
            sentiment = 'bullish'
        elif sell > buy * 1.5:
            sentiment = 'bearish'
        else:
            sentiment = 'mixed'
        entry['sentiment'] = sentiment
        entry['members'] = sorted(entry['members'])
        tickers.append(entry)

    # Sort by total_trades desc
    tickers.sort(key=lambda t: (t['total_trades'], t['total_value_min']), reverse=True)
    top = tickers[:limit]

    result = {
        "days": days,
        "total_tickers": len(tickers),
        "count": len(top),
        "tickers": top,
    }
    _cache.set(cache_key, result)
    return result


@router.get("/summary")
async def summary(
    days: int = Query(90, ge=1, le=365, description="Look-back window in days"),
):
    """
    Overall summary statistics for congressional trading.
    Returns trade counts, unique members, unique tickers, and most active entries.
    """
    cache_key = f"congress:summary:{days}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached is not None:
        return cached

    try:
        all_trades = await fetcher.fetch_all_trades()
    except Exception as exc:
        logger.error(f"Summary fetch error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    filtered = _filter_trades(all_trades, days, None, 'all', 'all')

    purchase_count = sum(1 for t in filtered if t.get('transaction_type') == 'Purchase')
    sale_count = sum(1 for t in filtered if t.get('transaction_type') == 'Sale')

    unique_members = {t.get('member', '') for t in filtered if t.get('member')}
    unique_tickers = {t.get('ticker', '') for t in filtered if t.get('ticker')}

    # Most active ticker
    ticker_counts: dict[str, int] = {}
    for t in filtered:
        tk = t.get('ticker', '')
        if tk:
            ticker_counts[tk] = ticker_counts.get(tk, 0) + 1
    most_active_ticker = max(ticker_counts, key=ticker_counts.get) if ticker_counts else None

    # Most active member
    member_counts: dict[str, int] = {}
    for t in filtered:
        m = t.get('member', '')
        if m:
            member_counts[m] = member_counts.get(m, 0) + 1
    most_active_member = max(member_counts, key=member_counts.get) if member_counts else None

    result = {
        "days": days,
        "total_trades": len(filtered),
        "purchase_count": purchase_count,
        "sale_count": sale_count,
        "unique_members": len(unique_members),
        "unique_tickers": len(unique_tickers),
        "most_active_ticker": most_active_ticker,
        "most_active_member": most_active_member,
    }
    _cache.set(cache_key, result)
    return result
