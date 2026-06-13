"""
Insider transaction fetcher — uses yfinance as primary source.
yfinance's insider_transactions DataFrame has columns:
  Shares, Value, URL, Text, Insider, Position, Transaction, Start Date
"""
import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


def _classify_transaction(text: str, transaction_col: Optional[str] = None) -> Optional[str]:
    """Return 'Buy' or 'Sell' from free-text or Transaction column."""
    if transaction_col:
        t = str(transaction_col).lower()
        if "sale" in t or "sold" in t:
            return "Sell"
        if "purchase" in t or "buy" in t or "bought" in t:
            return "Buy"

    if not text:
        return None
    text_lower = str(text).lower()
    if "purchase" in text_lower or "bought" in text_lower:
        return "Buy"
    if "sale" in text_lower or "sold" in text_lower or "sell" in text_lower:
        return "Sell"
    return None


def _parse_df_to_transactions(df: pd.DataFrame, ticker: str, days: int) -> list[dict]:
    """Convert a yfinance insider_transactions DataFrame to the standard transaction list."""
    if df is None or df.empty:
        return []

    cutoff = pd.Timestamp(date.today() - timedelta(days=days), tz="UTC")

    # Normalise the date column — yfinance uses "Start Date"
    date_col = None
    for col in df.columns:
        if "date" in col.lower() or col == "Start Date":
            date_col = col
            break

    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], utc=True, errors="coerce")
        df = df[df[date_col] >= cutoff].copy()

    if df.empty:
        return []

    results = []
    for _, row in df.iterrows():
        try:
            # Determine transaction type
            text_val = str(row.get("Text", "") or "")
            transaction_val = str(row.get("Transaction", "") or "")
            tx_type = _classify_transaction(text_val, transaction_val)
            if not tx_type:
                continue  # skip grants, awards, etc.

            shares_raw = row.get("Shares", 0)
            value_raw = row.get("Value", 0)
            shares = int(float(shares_raw)) if pd.notna(shares_raw) else 0
            value = float(value_raw) if pd.notna(value_raw) else 0.0

            price = round(value / shares, 2) if shares > 0 and value > 0 else 0.0

            tx_date = ""
            if date_col and pd.notna(row.get(date_col)):
                tx_date = str(row[date_col])[:10]

            insider_name = str(row.get("Insider", "") or "").title().strip()
            title = str(row.get("Position", "") or "").strip()

            results.append({
                "ticker": ticker.upper(),
                "insider_name": insider_name or "Unknown",
                "title": title,
                "transaction_type": tx_type,
                "shares": abs(shares),
                "price": price,
                "value": abs(value),
                "date": tx_date,
                "ownership_type": "Direct",
            })
        except Exception as exc:
            logger.debug(f"Row parse error for {ticker}: {exc}")
            continue

    # Sort by date descending
    results.sort(key=lambda r: r["date"], reverse=True)
    return results


def fetch_transactions(ticker: str, days: int = 180) -> list[dict]:
    """
    Fetch insider transactions for a ticker using yfinance.
    Returns a list of transaction dicts. Falls back to [] on any error.
    """
    try:
        t = yf.Ticker(ticker)
        df = t.insider_transactions
        return _parse_df_to_transactions(df, ticker, days)
    except Exception as e:
        logger.warning(f"insider fetch failed for {ticker}: {e}")
        return []


def fetch_summary(ticker: str, days: int = 180) -> dict:
    """
    Aggregate insider summary for a ticker.
    Returns net_shares, net_value, buy_count, sell_count, insider_count, sentiment.
    """
    transactions = fetch_transactions(ticker, days)

    buy_shares = sum(t["shares"] for t in transactions if t["transaction_type"] == "Buy")
    sell_shares = sum(t["shares"] for t in transactions if t["transaction_type"] == "Sell")
    buy_value = sum(t["value"] for t in transactions if t["transaction_type"] == "Buy")
    sell_value = sum(t["value"] for t in transactions if t["transaction_type"] == "Sell")
    buy_count = sum(1 for t in transactions if t["transaction_type"] == "Buy")
    sell_count = sum(1 for t in transactions if t["transaction_type"] == "Sell")

    insider_names = {t["insider_name"] for t in transactions}
    insider_count = len(insider_names)

    net_shares = buy_shares - sell_shares
    net_value = buy_value - sell_value

    if buy_count > sell_count and buy_value > sell_value:
        sentiment = "Bullish"
    elif sell_count > buy_count and sell_value > buy_value:
        sentiment = "Bearish"
    elif buy_count == 0 and sell_count == 0:
        sentiment = "No Activity"
    else:
        sentiment = "Neutral"

    return {
        "ticker": ticker.upper(),
        "period_days": days,
        "net_shares": net_shares,
        "net_value": round(net_value),
        "buy_shares": buy_shares,
        "sell_shares": sell_shares,
        "buy_value": round(buy_value),
        "sell_value": round(sell_value),
        "buy_count": buy_count,
        "sell_count": sell_count,
        "insider_count": insider_count,
        "sentiment": sentiment,
        "transaction_count": len(transactions),
    }
