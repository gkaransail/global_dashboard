"""
Insider transaction signals: net buying/selling value in last 90 days.
Score range: -1.0 (heavy selling) to +1.0 (heavy buying).
"""
import logging
from datetime import date, timedelta
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 90


def score(ticker: str) -> dict:
    try:
        t = yf.Ticker(ticker)
        df = t.insider_transactions
        if df is None or df.empty:
            return _empty()

        # Filter to last 90 days
        cutoff = pd.Timestamp(date.today() - timedelta(days=LOOKBACK_DAYS), tz="UTC")
        df["Start Date"] = pd.to_datetime(df["Start Date"], utc=True, errors="coerce")
        recent = df[df["Start Date"] >= cutoff].copy()

        if recent.empty:
            return _empty()

        # Classify transactions
        text = recent["Text"].fillna("").str.lower()
        is_buy  = text.str.contains("purchase")
        is_sell = text.str.contains("sale") | text.str.contains("sold")
        # Ignore: awards, grants, gifts, conversions, exercises

        buys  = recent[is_buy]
        sells = recent[is_sell]

        buy_value  = float(buys["Value"].fillna(0).sum())
        sell_value = float(sells["Value"].fillna(0).sum())
        buy_count  = len(buys)
        sell_count = len(sells)

        net_value = buy_value - sell_value
        total_value = buy_value + sell_value

        if total_value == 0 and buy_count == 0 and sell_count == 0:
            return _empty()

        # Score based on net value and count ratio
        if total_value > 0:
            value_ratio = net_value / total_value  # -1 to +1
        elif buy_count > sell_count:
            value_ratio = 0.3
        elif sell_count > buy_count:
            value_ratio = -0.3
        else:
            value_ratio = 0.0

        # Amplify strong signals
        composite = value_ratio * 0.9
        if buy_count >= 3 and buy_value > sell_value:
            composite = min(1.0, composite + 0.15)
        if sell_count >= 5 and sell_value > buy_value * 2:
            composite = max(-1.0, composite - 0.15)

        composite = max(-1.0, min(1.0, composite))

        reasons = []
        if buy_count > 0:
            reasons.append(f"{buy_count} insider purchase{'s' if buy_count > 1 else ''} (${buy_value/1e6:.1f}M)")
        if sell_count > 0:
            reasons.append(f"{sell_count} insider sale{'s' if sell_count > 1 else ''} (${sell_value/1e6:.1f}M)")

        # Recent buyers list (top 3)
        buyers = []
        if not buys.empty:
            for _, row in buys.head(3).iterrows():
                buyers.append({
                    "name": str(row.get("Insider", "")).title(),
                    "role": str(row.get("Position", "")),
                    "value": float(row.get("Value", 0)),
                    "shares": int(row.get("Shares", 0)),
                    "date": str(row.get("Start Date", ""))[:10],
                })

        return {
            "score": round(composite, 3),
            "buy_count": buy_count,
            "sell_count": sell_count,
            "buy_value": round(buy_value),
            "sell_value": round(sell_value),
            "net_value": round(net_value),
            "buyers": buyers,
            "reasons": reasons,
        }
    except Exception as e:
        logger.debug(f"Insider signal failed for {ticker}: {e}")
        return _empty()


def _empty():
    return {"score": 0.0, "buy_count": 0, "sell_count": 0,
            "buy_value": 0, "sell_value": 0, "net_value": 0, "buyers": [], "reasons": []}
