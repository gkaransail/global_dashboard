"""
Technical Analysis computation module.

All indicators are computed from pandas/numpy only — no scipy, no ta-lib.
Data is fetched via the shared fetcher at core/data/fetcher.py.
"""
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from core import cache as _cache
from core.data.fetcher import fetch_ohlcv

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes

# Universe for screener (50 popular tickers)
SCREENER_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "BAC", "GS",
    "AMD", "NFLX", "CRM", "ORCL", "INTC", "QCOM", "AVGO", "MU", "TXN", "AMAT",
    "SPY", "QQQ", "IWM", "DIA", "XLK", "XLF", "XLE", "XLV", "XLI", "XLY",
    "BRK-B", "JNJ", "PG", "KO", "PEP", "WMT", "HD", "V", "MA", "PYPL",
    "DIS", "CMCSA", "T", "VZ", "COIN", "UBER", "LYFT", "ABNB", "SNOW", "PLTR",
]


# ────────────────────────────────────────────────────────────────────────────
# Low-level indicator helpers (pure numpy / pandas)
# ────────────────────────────────────────────────────────────────────────────

def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder smoothing: initial SMA then EWM with alpha = 1/period
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger(close: pd.Series, period: int = 20, num_std: float = 2.0):
    mid = close.rolling(period).mean()
    std = close.rolling(period).std(ddof=0)
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower, std


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def _stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k_period: int = 14, d_period: int = 3):
    lowest_low = low.rolling(k_period).min()
    highest_high = high.rolling(k_period).max()
    denom = (highest_high - lowest_low).replace(0, np.nan)
    pct_k = 100 * (close - lowest_low) / denom
    pct_d = pct_k.rolling(d_period).mean()
    return pct_k, pct_d


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series, period: int = 20) -> pd.Series:
    typical_price = (high + low + close) / 3
    tp_vol = typical_price * volume
    rolling_tpv = tp_vol.rolling(period).sum()
    rolling_vol = volume.rolling(period).sum().replace(0, np.nan)
    return rolling_tpv / rolling_vol


def _safe_float(val) -> Optional[float]:
    try:
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
    except Exception:
        return None


def _series_tail(series: pd.Series, n: int = 60) -> list:
    tail = series.dropna().tail(n)
    return [_safe_float(v) for v in tail]


# ────────────────────────────────────────────────────────────────────────────
# Public: get_indicators
# ────────────────────────────────────────────────────────────────────────────

def get_indicators(ticker: str, period: str = "3mo", lookback_days: int = 90) -> dict:
    cache_key = f"tech_indicators:{ticker}:{period}:{lookback_days}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    # Fetch enough data for EMA-200; always request at least 1y to have history
    fetch_period = period if period in ("1y", "2y", "5y") else "1y"
    df = fetch_ohlcv(ticker, period=fetch_period)
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data available for {ticker}")

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    # ── Compute all indicators ───────────────────────────────────────────────
    rsi_series = _rsi(close)
    macd_line, signal_line, histogram = _macd(close)
    bb_upper, bb_mid, bb_lower, bb_std = _bollinger(close)
    ema20_series = _ema(close, 20)
    ema50_series = _ema(close, 50)
    ema200_series = _ema(close, 200)
    atr_series = _atr(high, low, close)
    stoch_k, stoch_d = _stochastic(high, low, close)
    vwap_series = _vwap(high, low, close, volume)

    # ── Current values ───────────────────────────────────────────────────────
    price = _safe_float(close.iloc[-1])

    rsi_val = _safe_float(rsi_series.iloc[-1])
    macd_val = _safe_float(macd_line.iloc[-1])
    macd_sig = _safe_float(signal_line.iloc[-1])
    macd_hist = _safe_float(histogram.iloc[-1])

    bb_u = _safe_float(bb_upper.iloc[-1])
    bb_m = _safe_float(bb_mid.iloc[-1])
    bb_l = _safe_float(bb_lower.iloc[-1])
    bb_width = _safe_float((bb_upper.iloc[-1] - bb_lower.iloc[-1]) / bb_mid.iloc[-1] * 100) if bb_m else None
    bb_pct_b = None
    if bb_u and bb_l and bb_u != bb_l and price:
        bb_pct_b = _safe_float((price - bb_l) / (bb_u - bb_l))

    ema20_val = _safe_float(ema20_series.iloc[-1])
    ema50_val = _safe_float(ema50_series.iloc[-1])
    ema200_val = _safe_float(ema200_series.dropna().iloc[-1]) if not ema200_series.dropna().empty else None

    atr_val = _safe_float(atr_series.iloc[-1])
    atr_pct = _safe_float(atr_val / price * 100) if (atr_val and price) else None

    stoch_k_val = _safe_float(stoch_k.iloc[-1])
    stoch_d_val = _safe_float(stoch_d.iloc[-1])

    vwap_val = _safe_float(vwap_series.iloc[-1])

    # ── History arrays (last 60 bars) ────────────────────────────────────────
    dates_tail = [d.strftime("%Y-%m-%d") for d in df.index[-60:]]

    # ── Signals ─────────────────────────────────────────────────────────────
    rsi_signal = "neutral"
    if rsi_val is not None:
        if rsi_val < 30:
            rsi_signal = "oversold"
        elif rsi_val > 70:
            rsi_signal = "overbought"

    macd_signal = "neutral"
    if macd_val is not None and macd_sig is not None:
        if macd_val > macd_sig:
            macd_signal = "bullish"
        else:
            macd_signal = "bearish"

    bb_signal = "neutral"
    if price and bb_u and bb_l:
        if price >= bb_u:
            bb_signal = "upper"
        elif price <= bb_l:
            bb_signal = "lower"

    # Trend based on EMA stack
    trend = "sideways"
    if ema20_val and ema50_val and ema200_val and price:
        if price > ema20_val > ema50_val > ema200_val:
            trend = "uptrend"
        elif price < ema20_val < ema50_val < ema200_val:
            trend = "downtrend"

    # Golden/death cross: EMA20 vs EMA50 in last 5 bars
    golden_cross = False
    death_cross = False
    if len(ema20_series.dropna()) >= 6 and len(ema50_series.dropna()) >= 6:
        e20 = ema20_series.dropna()
        e50 = ema50_series.dropna()
        aligned = pd.DataFrame({"e20": e20, "e50": e50}).dropna()
        if len(aligned) >= 6:
            recent = aligned.tail(6)
            prev_diff = recent["e20"].iloc[-6] - recent["e50"].iloc[-6]
            curr_diff = recent["e20"].iloc[-1] - recent["e50"].iloc[-1]
            # Check if any crossover happened in last 5 bars
            for i in range(len(recent) - 1):
                d1 = recent["e20"].iloc[i] - recent["e50"].iloc[i]
                d2 = recent["e20"].iloc[i + 1] - recent["e50"].iloc[i + 1]
                if d1 < 0 and d2 > 0:
                    golden_cross = True
                elif d1 > 0 and d2 < 0:
                    death_cross = True

    result = {
        "ticker": ticker,
        "price": price,
        "indicators": {
            "rsi": {
                "value": rsi_val,
                "history": _series_tail(rsi_series, 60),
            },
            "macd": {
                "line": macd_val,
                "signal": macd_sig,
                "histogram": macd_hist,
                "history_line": _series_tail(macd_line, 60),
                "history_signal": _series_tail(signal_line, 60),
                "history_histogram": _series_tail(histogram, 60),
            },
            "bollinger": {
                "upper": bb_u,
                "mid": bb_m,
                "lower": bb_l,
                "width": bb_width,
                "pct_b": bb_pct_b,
            },
            "ema20": {
                "value": ema20_val,
                "history": _series_tail(ema20_series, 60),
            },
            "ema50": {
                "value": ema50_val,
                "history": _series_tail(ema50_series, 60),
            },
            "ema200": {
                "value": ema200_val,
                "history": _series_tail(ema200_series, 60),
            },
            "atr": {
                "value": atr_val,
                "atr_pct": atr_pct,
            },
            "stochastic": {
                "k": stoch_k_val,
                "d": stoch_d_val,
                "history_k": _series_tail(stoch_k, 30),
                "history_d": _series_tail(stoch_d, 30),
            },
            "vwap": {
                "value": vwap_val,
            },
        },
        "signals": {
            "rsi_signal": rsi_signal,
            "macd_signal": macd_signal,
            "bb_signal": bb_signal,
            "trend": trend,
            "golden_cross": golden_cross,
            "death_cross": death_cross,
        },
        "dates": dates_tail,
    }

    _cache.set(cache_key, result)
    return result


# ────────────────────────────────────────────────────────────────────────────
# Public: get_patterns
# ────────────────────────────────────────────────────────────────────────────

def _local_extrema(series: pd.Series, order: int = 5):
    """Return indices of local maxima and minima with given order."""
    vals = series.values
    n = len(vals)
    peaks = []
    troughs = []
    for i in range(order, n - order):
        window = vals[i - order: i + order + 1]
        if vals[i] == max(window):
            peaks.append(i)
        if vals[i] == min(window):
            troughs.append(i)
    return peaks, troughs


def get_patterns(ticker: str, period: str = "6mo") -> dict:
    cache_key = f"tech_patterns:{ticker}:{period}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    df = fetch_ohlcv(ticker, period=period)
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data available for {ticker}")

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    price = float(close.iloc[-1])

    patterns = []
    today_str = date.today().strftime("%Y-%m-%d")

    peak_idx, trough_idx = _local_extrema(close, order=5)
    peaks = [(i, float(close.iloc[i])) for i in peak_idx]
    troughs = [(i, float(close.iloc[i])) for i in trough_idx]

    hi_52w = float(high.tail(252).max()) if len(high) >= 10 else float(high.max())
    lo_52w = float(low.tail(252).min()) if len(low) >= 10 else float(low.min())

    # ── Breakout / Breakdown ─────────────────────────────────────────────────
    if price >= hi_52w * 0.99:
        patterns.append({
            "type": "breakout",
            "confidence": round(min(1.0, price / hi_52w), 2),
            "description": f"{ticker} is trading at or above its 52-week high — a bullish breakout signal.",
            "target": round(hi_52w * 1.05, 2),
            "invalidation": round(hi_52w * 0.97, 2),
            "detected_at": today_str,
        })

    if price <= lo_52w * 1.01:
        patterns.append({
            "type": "breakdown",
            "confidence": round(min(1.0, lo_52w / price), 2),
            "description": f"{ticker} is trading at or below its 52-week low — a bearish breakdown signal.",
            "target": round(lo_52w * 0.95, 2),
            "invalidation": round(lo_52w * 1.03, 2),
            "detected_at": today_str,
        })

    # ── Double Top ───────────────────────────────────────────────────────────
    if len(peaks) >= 2:
        p1 = peaks[-2]
        p2 = peaks[-1]
        avg_peak = (p1[1] + p2[1]) / 2
        diff_pct = abs(p1[1] - p2[1]) / avg_peak
        if diff_pct < 0.03 and (p2[0] - p1[0]) >= 5:
            # Need a trough between the two peaks
            troughs_between = [t for t in troughs if p1[0] < t[0] < p2[0]]
            if troughs_between:
                confidence = round(max(0.4, 1 - diff_pct * 20), 2)
                neckline = min(t[1] for t in troughs_between)
                patterns.append({
                    "type": "double_top",
                    "confidence": confidence,
                    "description": f"Two peaks near ${avg_peak:.2f} with a trough between — bearish reversal pattern.",
                    "target": round(neckline - (avg_peak - neckline), 2),
                    "invalidation": round(avg_peak * 1.02, 2),
                    "detected_at": today_str,
                })

    # ── Double Bottom ────────────────────────────────────────────────────────
    if len(troughs) >= 2:
        t1 = troughs[-2]
        t2 = troughs[-1]
        avg_trough = (t1[1] + t2[1]) / 2
        diff_pct = abs(t1[1] - t2[1]) / avg_trough
        if diff_pct < 0.03 and (t2[0] - t1[0]) >= 5:
            peaks_between = [p for p in peaks if t1[0] < p[0] < t2[0]]
            if peaks_between:
                confidence = round(max(0.4, 1 - diff_pct * 20), 2)
                neckline = max(p[1] for p in peaks_between)
                patterns.append({
                    "type": "double_bottom",
                    "confidence": confidence,
                    "description": f"Two troughs near ${avg_trough:.2f} with a peak between — bullish reversal pattern.",
                    "target": round(neckline + (neckline - avg_trough), 2),
                    "invalidation": round(avg_trough * 0.98, 2),
                    "detected_at": today_str,
                })

    # ── Head and Shoulders ───────────────────────────────────────────────────
    if len(peaks) >= 3 and len(troughs) >= 2:
        left_sh = peaks[-3]
        head = peaks[-2]
        right_sh = peaks[-1]
        if (head[1] > left_sh[1] * 1.02 and
                head[1] > right_sh[1] * 1.02 and
                abs(left_sh[1] - right_sh[1]) / head[1] < 0.05):
            # Troughs between shoulders
            t_left = [t for t in troughs if left_sh[0] < t[0] < head[0]]
            t_right = [t for t in troughs if head[0] < t[0] < right_sh[0]]
            if t_left and t_right:
                neckline = (t_left[-1][1] + t_right[0][1]) / 2
                confidence = round(min(0.85, 0.5 + (head[1] - (left_sh[1] + right_sh[1]) / 2) / head[1] * 5), 2)
                patterns.append({
                    "type": "head_and_shoulders",
                    "confidence": confidence,
                    "description": "Classic H&S pattern — left shoulder, higher head, right shoulder near neckline. Bearish reversal.",
                    "target": round(neckline - (head[1] - neckline), 2),
                    "invalidation": round(head[1] * 1.01, 2),
                    "detected_at": today_str,
                })

    # ── Inverse Head and Shoulders ───────────────────────────────────────────
    if len(troughs) >= 3 and len(peaks) >= 2:
        left_sh = troughs[-3]
        head = troughs[-2]
        right_sh = troughs[-1]
        if (head[1] < left_sh[1] * 0.98 and
                head[1] < right_sh[1] * 0.98 and
                abs(left_sh[1] - right_sh[1]) / (head[1] + 1e-9) < 0.05):
            p_left = [p for p in peaks if left_sh[0] < p[0] < head[0]]
            p_right = [p for p in peaks if head[0] < p[0] < right_sh[0]]
            if p_left and p_right:
                neckline = (p_left[-1][1] + p_right[0][1]) / 2
                confidence = round(min(0.85, 0.5 + ((left_sh[1] + right_sh[1]) / 2 - head[1]) / (head[1] + 1e-9) * 5), 2)
                patterns.append({
                    "type": "inverse_head_and_shoulders",
                    "confidence": confidence,
                    "description": "Inverse H&S — bullish reversal with two higher troughs flanking a deeper head.",
                    "target": round(neckline + (neckline - head[1]), 2),
                    "invalidation": round(head[1] * 0.99, 2),
                    "detected_at": today_str,
                })

    # ── Triangle Patterns ────────────────────────────────────────────────────
    if len(peaks) >= 3 and len(troughs) >= 3:
        recent_peaks = peaks[-3:]
        recent_troughs = troughs[-3:]
        peak_vals = [p[1] for p in recent_peaks]
        trough_vals = [t[1] for t in recent_troughs]

        peak_slope = (peak_vals[-1] - peak_vals[0]) / max(1, recent_peaks[-1][0] - recent_peaks[0][0])
        trough_slope = (trough_vals[-1] - trough_vals[0]) / max(1, recent_troughs[-1][0] - recent_troughs[0][0])

        peak_range = abs(peak_vals[-1] - peak_vals[0]) / (peak_vals[0] + 1e-9)
        trough_range = abs(trough_vals[-1] - trough_vals[0]) / (trough_vals[0] + 1e-9)

        if peak_range > 0.02 or trough_range > 0.02:
            # Ascending triangle: flat top, rising bottom
            if peak_range < 0.02 and trough_slope > 0:
                patterns.append({
                    "type": "ascending_triangle",
                    "confidence": 0.65,
                    "description": "Flat resistance with rising support — bullish continuation or breakout pattern.",
                    "target": round(peak_vals[-1] * 1.06, 2),
                    "invalidation": round(trough_vals[-1] * 0.98, 2),
                    "detected_at": today_str,
                })
            # Descending triangle: declining top, flat bottom
            elif trough_range < 0.02 and peak_slope < 0:
                patterns.append({
                    "type": "descending_triangle",
                    "confidence": 0.65,
                    "description": "Declining resistance with flat support — bearish continuation or breakdown pattern.",
                    "target": round(trough_vals[-1] * 0.94, 2),
                    "invalidation": round(peak_vals[-1] * 1.02, 2),
                    "detected_at": today_str,
                })
            # Symmetrical triangle: converging
            elif peak_slope < 0 and trough_slope > 0:
                patterns.append({
                    "type": "symmetrical_triangle",
                    "confidence": 0.55,
                    "description": "Converging highs and lows — breakout direction to be confirmed by volume.",
                    "target": round(price * 1.05, 2),
                    "invalidation": round(price * 0.95, 2),
                    "detected_at": today_str,
                })

    # ── Bull Flag ────────────────────────────────────────────────────────────
    if len(df) >= 20:
        pole_window = close.iloc[-20:-10]
        flag_window = close.iloc[-10:]
        pole_ret = (float(pole_window.iloc[-1]) - float(pole_window.iloc[0])) / (float(pole_window.iloc[0]) + 1e-9)
        flag_ret = (float(flag_window.iloc[-1]) - float(flag_window.iloc[0])) / (float(flag_window.iloc[0]) + 1e-9)
        if pole_ret > 0.05 and -0.04 < flag_ret < 0.005:
            patterns.append({
                "type": "bull_flag",
                "confidence": round(min(0.80, 0.5 + pole_ret * 2), 2),
                "description": f"Sharp {round(pole_ret*100,1)}% rally followed by shallow consolidation — bullish continuation.",
                "target": round(price * (1 + pole_ret * 0.8), 2),
                "invalidation": round(flag_window.min() * 0.98, 2),
                "detected_at": today_str,
            })

    # ── Bear Flag ────────────────────────────────────────────────────────────
    if len(df) >= 20:
        pole_window = close.iloc[-20:-10]
        flag_window = close.iloc[-10:]
        pole_ret = (float(pole_window.iloc[-1]) - float(pole_window.iloc[0])) / (float(pole_window.iloc[0]) + 1e-9)
        flag_ret = (float(flag_window.iloc[-1]) - float(flag_window.iloc[0])) / (float(flag_window.iloc[0]) + 1e-9)
        if pole_ret < -0.05 and -0.005 < flag_ret < 0.04:
            patterns.append({
                "type": "bear_flag",
                "confidence": round(min(0.80, 0.5 + abs(pole_ret) * 2), 2),
                "description": f"Sharp {round(abs(pole_ret)*100,1)}% drop followed by shallow bounce — bearish continuation.",
                "target": round(price * (1 + pole_ret * 0.8), 2),
                "invalidation": round(flag_window.max() * 1.02, 2),
                "detected_at": today_str,
            })

    # Sort by confidence descending
    patterns.sort(key=lambda p: p["confidence"], reverse=True)

    result = {
        "ticker": ticker,
        "price": round(price, 2),
        "patterns": patterns,
        "pattern_count": len(patterns),
    }
    _cache.set(cache_key, result)
    return result


# ────────────────────────────────────────────────────────────────────────────
# Public: get_levels
# ────────────────────────────────────────────────────────────────────────────

def get_levels(ticker: str, period: str = "6mo") -> dict:
    cache_key = f"tech_levels:{ticker}:{period}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    df = fetch_ohlcv(ticker, period=period)
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data available for {ticker}")

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    price = float(close.iloc[-1])

    support_levels = []
    resistance_levels = []

    # ── 52-week high / low ───────────────────────────────────────────────────
    hi_52w = float(high.tail(252).max()) if len(high) >= 10 else float(high.max())
    lo_52w = float(low.tail(252).min()) if len(low) >= 10 else float(low.min())

    if hi_52w > price:
        resistance_levels.append({
            "price": round(hi_52w, 2),
            "strength": "strong",
            "type": "52w_high",
            "label": "52W High",
        })
    else:
        support_levels.append({
            "price": round(hi_52w, 2),
            "strength": "moderate",
            "type": "prior_high",
            "label": "52W High (Broken)",
        })

    if lo_52w < price:
        support_levels.append({
            "price": round(lo_52w, 2),
            "strength": "strong",
            "type": "52w_low",
            "label": "52W Low",
        })
    else:
        resistance_levels.append({
            "price": round(lo_52w, 2),
            "strength": "moderate",
            "type": "prior_low",
            "label": "52W Low (Broken)",
        })

    # ── Local extrema from closes ────────────────────────────────────────────
    peak_idx, trough_idx = _local_extrema(close, order=5)

    for idx in peak_idx[-8:]:
        lvl = float(close.iloc[idx])
        if abs(lvl - price) / price < 0.01:
            continue
        if lvl > price:
            resistance_levels.append({
                "price": round(lvl, 2),
                "strength": "moderate",
                "type": "prior_high",
                "label": "Prior High",
            })
        else:
            support_levels.append({
                "price": round(lvl, 2),
                "strength": "moderate",
                "type": "prior_high",
                "label": "Prior High",
            })

    for idx in trough_idx[-8:]:
        lvl = float(close.iloc[idx])
        if abs(lvl - price) / price < 0.01:
            continue
        if lvl < price:
            support_levels.append({
                "price": round(lvl, 2),
                "strength": "moderate",
                "type": "prior_low",
                "label": "Prior Low",
            })
        else:
            resistance_levels.append({
                "price": round(lvl, 2),
                "strength": "weak",
                "type": "prior_low",
                "label": "Prior Low",
            })

    # ── Round number levels (±15% of current price) ──────────────────────────
    magnitude = 10 ** math.floor(math.log10(price))
    step = magnitude / 2 if price / magnitude < 5 else magnitude
    lo_bound = price * 0.85
    hi_bound = price * 1.15
    round_val = math.floor(lo_bound / step) * step
    while round_val <= hi_bound:
        if abs(round_val - price) / price > 0.005:
            if round_val > price:
                resistance_levels.append({
                    "price": round(round_val, 2),
                    "strength": "weak",
                    "type": "round_number",
                    "label": f"Round ${round_val:.0f}",
                })
            else:
                support_levels.append({
                    "price": round(round_val, 2),
                    "strength": "weak",
                    "type": "round_number",
                    "label": f"Round ${round_val:.0f}",
                })
        round_val += step

    # ── EMA levels ───────────────────────────────────────────────────────────
    ema_levels = [
        (20, "EMA 20"),
        (50, "EMA 50"),
        (200, "EMA 200"),
    ]
    for span, label in ema_levels:
        ema_s = _ema(close, span).dropna()
        if ema_s.empty:
            continue
        lvl = float(ema_s.iloc[-1])
        if abs(lvl - price) / price < 0.005:
            continue
        strength = "strong" if span == 200 else "moderate"
        entry = {"price": round(lvl, 2), "strength": strength, "type": "ema", "label": label}
        if lvl < price:
            support_levels.append(entry)
        else:
            resistance_levels.append(entry)

    # ── Deduplicate nearby levels (within 0.5%) ───────────────────────────────
    def _dedup(levels: list, threshold: float = 0.005) -> list:
        if not levels:
            return levels
        levels = sorted(levels, key=lambda x: -x["price"])
        deduped = [levels[0]]
        for lvl in levels[1:]:
            if abs(lvl["price"] - deduped[-1]["price"]) / (deduped[-1]["price"] + 1e-9) > threshold:
                deduped.append(lvl)
        return deduped

    support_levels = _dedup(sorted(support_levels, key=lambda x: -x["price"]))
    resistance_levels = _dedup(sorted(resistance_levels, key=lambda x: x["price"]))

    result = {
        "ticker": ticker,
        "current_price": round(price, 2),
        "support": support_levels[:8],
        "resistance": resistance_levels[:8],
    }
    _cache.set(cache_key, result)
    return result


# ────────────────────────────────────────────────────────────────────────────
# Public: get_screener
# ────────────────────────────────────────────────────────────────────────────

AVAILABLE_CONDITIONS = {
    "rsi_oversold",
    "rsi_overbought",
    "above_ema200",
    "below_ema200",
    "golden_cross",
    "death_cross",
    "bb_squeeze",
    "high_volume",
    "near_52w_high",
    "near_52w_low",
}


def _scan_ticker(ticker: str) -> Optional[dict]:
    """Scan a single ticker and return its condition flags plus key metrics."""
    try:
        df = fetch_ohlcv(ticker, period="1y")
        if df is None or len(df) < 30:
            return None

        close = df["Close"]
        high = df["High"]
        low = df["Low"]
        volume = df["Volume"]

        price = float(close.iloc[-1])
        prev_close = float(close.iloc[-2]) if len(close) >= 2 else price
        change_pct = round((price - prev_close) / (prev_close + 1e-9) * 100, 2)

        rsi_series = _rsi(close)
        rsi_val = _safe_float(rsi_series.dropna().iloc[-1]) if not rsi_series.dropna().empty else None

        ema20_s = _ema(close, 20)
        ema50_s = _ema(close, 50)
        ema200_s = _ema(close, 200)
        ema20 = float(ema20_s.iloc[-1])
        ema50 = float(ema50_s.iloc[-1])
        ema200_clean = ema200_s.dropna()
        ema200 = float(ema200_clean.iloc[-1]) if not ema200_clean.empty else None

        bb_upper, bb_mid, bb_lower, _ = _bollinger(close)
        bb_u = float(bb_upper.iloc[-1]) if not pd.isna(bb_upper.iloc[-1]) else None
        bb_l = float(bb_lower.iloc[-1]) if not pd.isna(bb_lower.iloc[-1]) else None
        bb_m = float(bb_mid.iloc[-1]) if not pd.isna(bb_mid.iloc[-1]) else None

        vol_today = float(volume.iloc[-1])
        vol_avg_20 = float(volume.tail(21).iloc[:-1].mean()) if len(volume) >= 21 else float(volume.mean())

        hi_52w = float(high.tail(252).max()) if len(high) >= 252 else float(high.max())
        lo_52w = float(low.tail(252).min()) if len(low) >= 252 else float(low.min())

        # Golden / death cross in last 5 bars
        golden_cross = False
        death_cross = False
        aligned = pd.DataFrame({"e20": ema20_s, "e50": ema50_s}).dropna()
        if len(aligned) >= 6:
            recent = aligned.tail(6)
            for i in range(len(recent) - 1):
                d1 = recent["e20"].iloc[i] - recent["e50"].iloc[i]
                d2 = recent["e20"].iloc[i + 1] - recent["e50"].iloc[i + 1]
                if d1 < 0 and d2 > 0:
                    golden_cross = True
                elif d1 > 0 and d2 < 0:
                    death_cross = True

        conditions_met = []
        if rsi_val is not None and rsi_val < 30:
            conditions_met.append("rsi_oversold")
        if rsi_val is not None and rsi_val > 70:
            conditions_met.append("rsi_overbought")
        if ema200 and price > ema200:
            conditions_met.append("above_ema200")
        if ema200 and price < ema200:
            conditions_met.append("below_ema200")
        if golden_cross:
            conditions_met.append("golden_cross")
        if death_cross:
            conditions_met.append("death_cross")
        if bb_u and bb_l and bb_m:
            bb_width_pct = (bb_u - bb_l) / bb_m * 100
            if bb_width_pct < 5:
                conditions_met.append("bb_squeeze")
        if vol_avg_20 > 0 and vol_today > vol_avg_20 * 2:
            conditions_met.append("high_volume")
        if abs(price - hi_52w) / (hi_52w + 1e-9) <= 0.03:
            conditions_met.append("near_52w_high")
        if abs(price - lo_52w) / (lo_52w + 1e-9) <= 0.03:
            conditions_met.append("near_52w_low")

        return {
            "ticker": ticker,
            "price": round(price, 2),
            "change_pct": change_pct,
            "rsi": rsi_val,
            "conditions": conditions_met,
            "score": len(conditions_met),
        }
    except Exception as e:
        logger.debug(f"Screener scan failed for {ticker}: {e}")
        return None


def get_screener(conditions: list[str], limit: int = 30) -> dict:
    # Filter to valid conditions
    valid_conditions = [c for c in conditions if c in AVAILABLE_CONDITIONS]

    cache_key = f"tech_screener:{','.join(sorted(valid_conditions))}:{limit}"
    cached = _cache.get(cache_key, CACHE_TTL)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_scan_ticker, t): t for t in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            res = future.result()
            if res is not None:
                results.append(res)

    # Filter by requested conditions (ticker must match ALL requested conditions)
    if valid_conditions:
        results = [r for r in results if all(c in r["conditions"] for c in valid_conditions)]

    # Sort by score descending, then by ticker alphabetically
    results.sort(key=lambda r: (-r["score"], r["ticker"]))
    results = results[:limit]

    output = {
        "conditions_applied": valid_conditions,
        "available_conditions": sorted(AVAILABLE_CONDITIONS),
        "total_found": len(results),
        "results": results,
    }
    _cache.set(cache_key, output)
    return output
