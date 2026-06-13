"""
Fetches congressional trading data from public aggregator APIs.
House: https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json
Senate: https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json
Cache: 6 hours (data updates daily)
"""
import httpx
import logging
import re
from datetime import datetime, timedelta

from core import cache as _cache

logger = logging.getLogger(__name__)
CACHE_TTL = 21600  # 6 hours

HEADERS = {"User-Agent": "FinanceIQ-Dashboard research@financeiq.app"}

HOUSE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
SENATE_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json"


def _parse_amount_min(amount_str: str) -> int:
    """
    Extract the lower bound from disclosure amount strings.
    Examples:
      "$15,001 - $50,000" → 15001
      "$1,001 - $15,000" → 1001
      "$1,000,001 +" → 1000001
      "$500,000" → 500000
    """
    if not amount_str:
        return 0
    try:
        # Strip all whitespace and dollar signs for easier parsing
        cleaned = str(amount_str).strip()
        # Pull the first dollar amount from the string
        match = re.search(r'\$?([\d,]+)', cleaned)
        if not match:
            return 0
        raw = match.group(1).replace(',', '')
        return int(raw)
    except (ValueError, AttributeError):
        return 0


def _is_valid_ticker(ticker: str) -> bool:
    """Return True if the ticker looks like a real ticker symbol."""
    if not ticker:
        return False
    t = str(ticker).strip()
    if t in ('', '--', 'N/A', 'n/a', 'NA'):
        return False
    # Reject if it contains spaces or is longer than 10 chars
    if ' ' in t or len(t) > 10:
        return False
    return True


def _normalize_date(raw: str) -> str:
    """Try to parse a date string into YYYY-MM-DD format."""
    if not raw:
        return ''
    raw = str(raw).strip()
    # Already ISO format
    if re.match(r'^\d{4}-\d{2}-\d{2}', raw):
        return raw[:10]
    # Try MM/DD/YYYY
    try:
        dt = datetime.strptime(raw, '%m/%d/%Y')
        return dt.strftime('%Y-%m-%d')
    except ValueError:
        pass
    # Try other formats
    for fmt in ('%d-%b-%Y', '%B %d, %Y', '%b %d, %Y'):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return raw[:10] if len(raw) >= 10 else raw


def _normalize_transaction_type(raw: str) -> str:
    """Normalize to 'Purchase' or 'Sale'."""
    if not raw:
        return raw
    lower = str(raw).lower()
    if 'purchase' in lower or 'buy' in lower or 'bought' in lower:
        return 'Purchase'
    if 'sale' in lower or 'sell' in lower or 'sold' in lower:
        return 'Sale'
    return str(raw).strip()


def _normalize_party(raw: str) -> str:
    """Normalize party name."""
    if not raw:
        return ''
    lower = str(raw).lower().strip()
    if lower in ('d', 'dem', 'democrat', 'democratic'):
        return 'Democrat'
    if lower in ('r', 'rep', 'republican'):
        return 'Republican'
    if lower in ('i', 'ind', 'independent'):
        return 'Independent'
    return str(raw).strip()


def _normalize_house_trade(entry: dict) -> dict | None:
    """
    Normalize a House trade entry to the common schema.
    Returns None if the entry should be skipped.
    """
    try:
        ticker = str(entry.get('ticker', '') or '').strip().upper()
        if not _is_valid_ticker(ticker):
            return None

        transaction_type = _normalize_transaction_type(str(entry.get('type', '') or ''))
        # Skip entries that aren't purchases or sales (e.g. Exchange)
        if transaction_type not in ('Purchase', 'Sale'):
            return None

        raw_date = entry.get('transaction_date', '')
        tx_date = _normalize_date(str(raw_date) if raw_date else '')

        disclosure_raw = entry.get('disclosure_date', '')
        disclosure_date = _normalize_date(str(disclosure_raw) if disclosure_raw else '')

        rep_name = str(entry.get('representative', '') or '').strip()
        if not rep_name:
            return None

        # Prefix with Rep. if not already titled
        if not any(rep_name.startswith(p) for p in ('Rep.', 'Sen.', 'Representative', 'Senator')):
            member = f"Rep. {rep_name}"
        else:
            member = rep_name

        amount_str = str(entry.get('amount', '') or '').strip()

        return {
            'member': member,
            'chamber': 'house',
            'party': _normalize_party(str(entry.get('party', '') or '')),
            'state': str(entry.get('state', '') or '').strip().upper()[:2],
            'ticker': ticker,
            'asset_description': str(entry.get('asset_description', '') or '').strip(),
            'transaction_type': transaction_type,
            'amount': amount_str,
            'amount_min': _parse_amount_min(amount_str),
            'transaction_date': tx_date,
            'disclosure_date': disclosure_date,
            'source': 'house',
        }
    except Exception as exc:
        logger.debug(f"House trade normalization error: {exc}")
        return None


def _normalize_senate_trade(entry: dict) -> dict | None:
    """
    Normalize a Senate trade entry to the common schema.
    Returns None if the entry should be skipped.
    """
    try:
        ticker = str(entry.get('ticker', '') or '').strip().upper()
        if not _is_valid_ticker(ticker):
            return None

        transaction_type = _normalize_transaction_type(str(entry.get('type', '') or ''))
        if transaction_type not in ('Purchase', 'Sale'):
            return None

        raw_date = entry.get('transaction_date', '')
        tx_date = _normalize_date(str(raw_date) if raw_date else '')

        disclosure_raw = entry.get('disclosure_date', '')
        disclosure_date = _normalize_date(str(disclosure_raw) if disclosure_raw else '')

        senator_name = str(entry.get('senator', '') or '').strip()
        if not senator_name:
            return None

        if not any(senator_name.startswith(p) for p in ('Rep.', 'Sen.', 'Representative', 'Senator')):
            member = f"Sen. {senator_name}"
        else:
            member = senator_name

        amount_str = str(entry.get('amount', '') or '').strip()

        return {
            'member': member,
            'chamber': 'senate',
            'party': _normalize_party(str(entry.get('party', '') or '')),
            'state': str(entry.get('state', '') or '').strip().upper()[:2],
            'ticker': ticker,
            'asset_description': str(entry.get('asset_description', '') or '').strip(),
            'transaction_type': transaction_type,
            'amount': amount_str,
            'amount_min': _parse_amount_min(amount_str),
            'transaction_date': tx_date,
            'disclosure_date': disclosure_date,
            'source': 'senate',
        }
    except Exception as exc:
        logger.debug(f"Senate trade normalization error: {exc}")
        return None


async def fetch_all_trades() -> list[dict]:
    """
    Fetch and return all congressional trades from the last 365 days.
    Checks the in-memory cache first (TTL 6 hours).
    Fetches House + Senate in parallel via httpx.
    Returns a list sorted by transaction_date descending.
    """
    cache_key = 'congress:all_trades'
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached is not None:
        return cached

    cutoff = (datetime.utcnow() - timedelta(days=365)).strftime('%Y-%m-%d')
    trades: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=15.0, headers=HEADERS) as client:
            house_resp, senate_resp = await _fetch_both(client)

        # Parse House
        if house_resp is not None:
            try:
                house_data = house_resp.json()
                if isinstance(house_data, list):
                    for entry in house_data:
                        if not isinstance(entry, dict):
                            continue
                        normalized = _normalize_house_trade(entry)
                        if normalized:
                            trades.append(normalized)
            except Exception as exc:
                logger.warning(f"Failed to parse House JSON: {exc}")

        # Parse Senate
        if senate_resp is not None:
            try:
                senate_data = senate_resp.json()
                if isinstance(senate_data, list):
                    for entry in senate_data:
                        if not isinstance(entry, dict):
                            continue
                        normalized = _normalize_senate_trade(entry)
                        if normalized:
                            trades.append(normalized)
            except Exception as exc:
                logger.warning(f"Failed to parse Senate JSON: {exc}")

    except Exception as exc:
        logger.error(f"Error fetching congressional trades: {exc}")
        return []

    # Filter to last 365 days
    filtered = []
    for t in trades:
        tx_date = t.get('transaction_date', '')
        if tx_date and tx_date >= cutoff:
            filtered.append(t)
        elif not tx_date:
            # Include trades with missing dates (they may be recent)
            filtered.append(t)

    # Sort by transaction_date descending
    filtered.sort(key=lambda t: t.get('transaction_date', '') or '', reverse=True)

    _cache.set(cache_key, filtered)
    logger.info(f"Fetched {len(filtered)} congressional trades (365-day window)")
    return filtered


async def _fetch_both(client: httpx.AsyncClient):
    """Fetch both House and Senate endpoints concurrently."""
    import asyncio

    house_resp = None
    senate_resp = None

    async def get_house():
        nonlocal house_resp
        try:
            house_resp = await client.get(HOUSE_URL)
            house_resp.raise_for_status()
        except Exception as exc:
            logger.warning(f"House fetch failed: {exc}")

    async def get_senate():
        nonlocal senate_resp
        try:
            senate_resp = await client.get(SENATE_URL)
            senate_resp.raise_for_status()
        except Exception as exc:
            logger.warning(f"Senate fetch failed: {exc}")

    await asyncio.gather(get_house(), get_senate())
    return house_resp, senate_resp
