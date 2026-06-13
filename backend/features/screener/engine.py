"""
Multi-Factor Screener engine.

Scores each ticker across 4 independent signal dimensions, then combines
them into a single composite score (0-100).

Weights:
  Technical:   30%  (RSI, MACD, EMA trend, 52W position)
  Smart Money: 30%  (options flow, insider buying, institutional)
  Fundamental: 25%  (growth score + quality score)
  Sentiment:   15%  (FinBERT news compound → 0-100)
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

from core import cache as _cache
from core.data.fetcher import fetch_ohlcv

logger = logging.getLogger(__name__)

TICKER_CACHE_TTL = 1800   # 30 min per ticker
SCAN_CACHE_TTL   = 1800   # 30 min for full scan
MAX_WORKERS      = 10

WEIGHTS = {
    "technical":   0.30,
    "smart_money": 0.30,
    "fundamental": 0.25,
    "sentiment":   0.15,
}

UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "AMD",  "INTC", "QCOM",  "AVGO", "MU",   "AMAT", "KLAC",
    "CRM",  "ORCL", "NOW",   "ADBE", "PLTR", "SNOW",
    "JPM",  "BAC",  "GS",    "MS",   "WFC",  "V",    "MA",   "BLK",
    "JNJ",  "PFE",  "ABBV",  "UNH",  "LLY",  "AMGN",
    "XOM",  "CVX",  "COP",
    "HD",   "MCD",  "COST",  "WMT",  "NKE",  "SBUX",
    "BA",   "CAT",  "GE",    "LMT",
    "NFLX", "DIS",  "COIN",  "UBER", "SHOP", "PYPL",
]


# ── Indicator helpers ─────────────────────────────────────────────────────────

def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_g = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_l = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs    = avg_g / avg_l.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


# ── Per-dimension scorers ─────────────────────────────────────────────────────

def _tech_score(ticker: str) -> tuple[int, dict]:
    """Technical momentum score 0-100. >50 = bullish setup, <50 = bearish."""
    try:
        df = fetch_ohlcv(ticker, period="1y")
        if df is None or len(df) < 50:
            return 50, {}

        close  = df["Close"]
        high   = df["High"]
        low    = df["Low"]
        volume = df["Volume"]

        price = float(close.iloc[-1])

        rsi_s = _rsi(close)
        rsi   = float(rsi_s.dropna().iloc[-1]) if not rsi_s.dropna().empty else 50.0

        ema20 = float(_ema(close, 20).iloc[-1])
        ema50 = float(_ema(close, 50).iloc[-1])
        e200  = _ema(close, 200).dropna()
        ema200 = float(e200.iloc[-1]) if not e200.empty else None

        macd_line   = _ema(close, 12) - _ema(close, 26)
        signal_line = _ema(macd_line, 9)
        macd_bull   = float(macd_line.iloc[-1]) > float(signal_line.iloc[-1])

        hi52 = float(high.tail(252).max())
        lo52 = float(low.tail(252).min())
        pct52 = round((price - lo52) / (hi52 - lo52) * 100, 1) if hi52 != lo52 else 50.0

        # Volume surge (today vs 20d avg)
        vol_avg = float(volume.tail(21).iloc[:-1].mean()) if len(volume) >= 21 else float(volume.mean())
        vol_surge = float(volume.iloc[-1]) > vol_avg * 1.5

        score = 50

        # RSI
        if rsi < 30:   score += 12
        elif rsi < 45: score += 6
        elif rsi > 70: score -= 12
        elif rsi > 58: score -= 5

        # MACD
        score += 8 if macd_bull else -8

        # EMA stack
        score += 5 if price > ema20 else -5
        score += 7 if price > ema50 else -7
        if ema200 is not None:
            score += 10 if price > ema200 else -10
            if price > ema20 > ema50 > ema200:  # full golden stack
                score += 8
            elif price < ema20 < ema50 < ema200:
                score -= 8

        # 52W position
        if pct52 > 80: score += 5
        elif pct52 < 20: score -= 5

        score = max(0, min(100, round(score)))

        if ema200 is not None:
            trend = "uptrend" if price > ema20 > ema50 > ema200 \
                    else "downtrend" if price < ema20 < ema50 < ema200 \
                    else "sideways"
        else:
            trend = "uptrend" if price > ema20 > ema50 else "downtrend" if price < ema20 < ema50 else "sideways"

        return score, {
            "rsi":        round(rsi, 1),
            "macd_bull":  macd_bull,
            "trend":      trend,
            "pct_52w":    pct52,
            "vol_surge":  vol_surge,
        }
    except Exception as e:
        logger.debug(f"Tech score failed {ticker}: {e}")
        return 50, {}


def _smart_money_score(ticker: str) -> tuple[int, dict]:
    """Smart money composite -1→+1 scaled to 0→100."""
    try:
        from features.smart_money.signals import options as opt_sig
        from features.smart_money.signals import insider as ins_sig
        from features.smart_money.signals import institution as inst_sig

        opt  = opt_sig.score(ticker)
        ins  = ins_sig.score(ticker)
        inst = inst_sig.score(ticker)

        raw = (
            opt["score"]  * 0.40 +
            ins["score"]  * 0.35 +
            inst["score"] * 0.25
        )
        raw   = max(-1.0, min(1.0, raw))
        score = round((raw + 1) / 2 * 100)

        return score, {
            "options_score":     round(opt["score"], 3),
            "insider_score":     round(ins["score"], 3),
            "institution_score": round(inst["score"], 3),
            "raw":               round(raw, 3),
        }
    except Exception as e:
        logger.debug(f"Smart money score failed {ticker}: {e}")
        return 50, {}


def _fundamental_score(ticker: str) -> tuple[int, dict]:
    """Average of growth_score + quality_score from fundamental analyzer."""
    try:
        from features.fundamental.analyzer import _screener_fetch_one
        data = _screener_fetch_one(ticker)
        if not data:
            return 50, {}

        g = data.get("growth_score", 50)
        q = data.get("quality_score", 50)
        return round((g + q) / 2), {
            "growth_score":       g,
            "quality_score":      q,
            "pe_ratio":           data.get("pe_ratio"),
            "revenue_growth_pct": data.get("revenue_growth_pct"),
        }
    except Exception as e:
        logger.debug(f"Fundamental score failed {ticker}: {e}")
        return 50, {}


def _sentiment_score(ticker: str) -> tuple[int, dict]:
    """FinBERT news compound (-1→+1) scaled to 0→100."""
    try:
        from core.news import fetch_ticker_news
        from features.sentiment_ai.finbert import analyze_news_articles

        articles = fetch_ticker_news(ticker, max_items=8)
        if not articles:
            return 50, {"label": "No data", "avg_compound": 0}

        agg      = analyze_news_articles(articles)["aggregate"]
        compound = agg["avg_compound"]
        score    = max(0, min(100, round((compound + 1) / 2 * 100)))

        return score, {
            "label":        agg["label"],
            "avg_compound": compound,
            "articles":     len(articles),
        }
    except Exception as e:
        logger.debug(f"Sentiment score failed {ticker}: {e}")
        return 50, {}


# ── Per-ticker full score ─────────────────────────────────────────────────────

def score_ticker(ticker: str) -> Optional[dict]:
    """Score a single ticker across all 4 factors. Returns None on hard failure."""
    cache_key = f"screener_score_{ticker}"
    cached = _cache.get(cache_key, ttl=TICKER_CACHE_TTL)
    if cached:
        return cached

    try:
        t     = yf.Ticker(ticker)
        price = float(t.fast_info.last_price)
        prev  = float(t.fast_info.previous_close or price)
        chg   = round((price - prev) / prev * 100, 2) if prev else 0.0
    except Exception:
        return None

    tech_s,  tech_d  = _tech_score(ticker)
    sm_s,    sm_d    = _smart_money_score(ticker)
    fund_s,  fund_d  = _fundamental_score(ticker)
    sent_s,  sent_d  = _sentiment_score(ticker)

    composite = round(
        tech_s * WEIGHTS["technical"]   +
        sm_s   * WEIGHTS["smart_money"] +
        fund_s * WEIGHTS["fundamental"] +
        sent_s * WEIGHTS["sentiment"]
    )

    if composite >= 72:   verdict = "Strong Buy"
    elif composite >= 58: verdict = "Buy"
    elif composite <= 28: verdict = "Strong Sell"
    elif composite <= 42: verdict = "Sell"
    else:                 verdict = "Neutral"

    result = {
        "ticker":          ticker.upper(),
        "price":           round(price, 2),
        "change_pct":      chg,
        "composite_score": composite,
        "verdict":         verdict,
        "scores": {
            "technical":   tech_s,
            "smart_money": sm_s,
            "fundamental": fund_s,
            "sentiment":   sent_s,
        },
        "detail": {
            "technical":   tech_d,
            "smart_money": sm_d,
            "fundamental": fund_d,
            "sentiment":   sent_d,
        },
    }

    _cache.set(cache_key, result)
    return result


# ── Full universe scan ────────────────────────────────────────────────────────

def run_scan(tickers: Optional[list] = None) -> dict:
    """
    Scan the universe (or a custom list) and return all tickers scored and ranked.
    Cached 30 min. Use tickers=None to scan default UNIVERSE.
    """
    universe  = [t.upper() for t in tickers] if tickers else UNIVERSE
    cache_key = f"screener_scan_{'_'.join(sorted(universe))}"
    cached    = _cache.get(cache_key, ttl=SCAN_CACHE_TTL)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(score_ticker, t): t for t in universe}
        for future in as_completed(futures):
            r = future.result()
            if r:
                results.append(r)

    results.sort(key=lambda r: r["composite_score"], reverse=True)

    output = {
        "results":       results,
        "total":         len(results),
        "universe_size": len(universe),
        "weights":       WEIGHTS,
        "last_updated":  datetime.utcnow().isoformat() + "Z",
    }

    _cache.set(cache_key, output)
    return output
