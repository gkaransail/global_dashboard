"""Shared data fetching layer — used by every feature module."""
import yfinance as yf
import pandas as pd
import logging
from typing import Optional
from core import cache as _cache

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 min


def fetch_ohlcv(ticker: str, period: str = "3mo", interval: str = "1d") -> Optional[pd.DataFrame]:
    key = f"ohlcv:{ticker}:{period}:{interval}"
    cached = _cache.get(key, CACHE_TTL)
    if cached is not None:
        return cached
    try:
        df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
        if df is None or df.empty:
            return None
        if hasattr(df.index, "tz") and df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        _cache.set(key, df)
        return df
    except Exception as e:
        logger.error(f"fetch_ohlcv({ticker}): {e}")
        return None


def fetch_multiple(tickers: list[str], period: str = "3mo") -> dict[str, Optional[pd.DataFrame]]:
    return {t: fetch_ohlcv(t, period=period) for t in tickers}


def get_returns(df: pd.DataFrame, days: int = 20) -> Optional[float]:
    if df is None or len(df) < days + 1:
        return None
    close = df["Close"]
    return float((close.iloc[-1] / close.iloc[-days - 1]) - 1)


# ── Macro tickers ───────────────────────────────────────────────────────────
MACRO_TICKERS = {
    "gold":   "GC=F",
    "dxy":    "DX-Y.NYB",
    "vix":    "^VIX",
    "oil":    "CL=F",
    "tnx":    "^TNX",
    "copper": "HG=F",
    "sp500":  "^GSPC",
    "qqq":    "QQQ",
}

SECTOR_ETFS = {
    "XLK":  "Technology",
    "XLF":  "Financials",
    "XLE":  "Energy",
    "XLV":  "Healthcare",
    "XLI":  "Industrials",
    "XLY":  "Consumer Discretionary",
    "XLP":  "Consumer Staples",
    "XLU":  "Utilities",
    "XLRE": "Real Estate",
    "XLB":  "Materials",
    "XLC":  "Communication",
}


def fetch_macro_data(period: str = "3mo") -> dict[str, Optional[pd.DataFrame]]:
    return fetch_multiple(list(MACRO_TICKERS.values()), period=period)


def fetch_sector_data(period: str = "3mo") -> dict[str, Optional[pd.DataFrame]]:
    return fetch_multiple(list(SECTOR_ETFS.keys()), period=period)
