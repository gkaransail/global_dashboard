"""
Momentum / Trend-Following model.

Five lenses that together answer: "is this stock in a strong, persistent trend?":

  1. Price momentum    — raw returns over 1M / 3M / 6M / 12M lookbacks
  2. Relative strength — 3M and 6M returns vs SPY benchmark
  3. Moving averages   — price vs EMA20/50/200, golden/death cross
  4. MACD             — 12/26/9 momentum oscillator
  5. ADX              — 14-day directional trend strength

Scoring: each sub-signal votes +1 (bull) / -1 (bear). The net vote determines
direction; ADX gates confidence (weak trend = lower confidence regardless of votes).
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _macd(close: pd.Series):
    fast  = _ema(close, 12)
    slow  = _ema(close, 26)
    line  = fast - slow
    signal = _ema(line, 9)
    hist  = line - signal
    return float(line.iloc[-1]), float(signal.iloc[-1]), float(hist.iloc[-1])


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float:
    """Average Directional Index — measures trend strength (not direction)."""
    tr   = pd.concat([high - low,
                      (high - close.shift(1)).abs(),
                      (low  - close.shift(1)).abs()], axis=1).max(axis=1)
    atr  = tr.ewm(span=period, adjust=False).mean()

    up   = high.diff()
    down = -low.diff()
    dm_plus  = up.where((up > down) & (up > 0), 0)
    dm_minus = down.where((down > up) & (down > 0), 0)

    di_plus  = 100 * dm_plus.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)
    di_minus = 100 * dm_minus.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)

    dx  = (100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan))
    adx = dx.ewm(span=period, adjust=False).mean()
    return round(float(adx.iloc[-1]), 1), round(float(di_plus.iloc[-1]), 1), round(float(di_minus.iloc[-1]), 1)


def _return_n_days(close: pd.Series, n: int) -> float | None:
    if len(close) < n + 1:
        return None
    return round(float((close.iloc[-1] / close.iloc[-(n + 1)] - 1) * 100), 2)


class MomentumModel(QuantModel):
    id          = "momentum"
    name        = "Momentum / Trend"
    description = (
        "Multi-timeframe price momentum, relative strength vs SPY, "
        "EMA crossovers, MACD, and ADX trend strength."
    )
    category    = "momentum"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch price data (ticker + SPY for relative strength) ─────────
        t      = yf.Ticker(ticker)
        spy    = yf.Ticker("SPY")
        hist   = t.history(period="18mo")
        s_hist = spy.history(period="18mo")

        if len(hist) < 60:
            raise ValueError(f"Insufficient price history for {ticker}")

        close  = hist["Close"]
        high   = hist["High"]
        low    = hist["Low"]

        # ── 2. Price momentum (raw returns) ──────────────────────────────────
        ret_1m  = _return_n_days(close, 21)
        ret_3m  = _return_n_days(close, 63)
        ret_6m  = _return_n_days(close, 126)
        ret_12m = _return_n_days(close, 252)

        # ── 3. Relative strength vs SPY ───────────────────────────────────────
        def rel_strength(n):
            if len(s_hist) < n + 1 or len(close) < n + 1:
                return None
            tkr_ret = (close.iloc[-1] / close.iloc[-(n+1)] - 1) * 100
            spy_ret = (s_hist["Close"].iloc[-1] / s_hist["Close"].iloc[-(n+1)] - 1) * 100
            return round(float(tkr_ret - spy_ret), 2)

        rs_3m = rel_strength(63)
        rs_6m = rel_strength(126)

        # ── 4. Moving averages ────────────────────────────────────────────────
        ema20  = _ema(close, 20)
        ema50  = _ema(close, 50)
        ema200 = _ema(close, 200)

        price      = float(close.iloc[-1])
        e20        = float(ema20.iloc[-1])
        e50        = float(ema50.iloc[-1])
        e200       = float(ema200.iloc[-1] if len(close) >= 200 else np.nan)
        golden_x   = float(ema50.iloc[-1]) > float(ema200.iloc[-1]) if len(close) >= 200 else None
        prev_cross = (float(ema50.iloc[-2]) <= float(ema200.iloc[-2])) if golden_x is not None and len(close) >= 201 else None
        fresh_cross = golden_x is not None and prev_cross is not None and (golden_x != (not prev_cross))

        above_ema20  = price > e20
        above_ema50  = price > e50
        above_ema200 = price > e200 if not np.isnan(e200) else None

        # ── 5. MACD ───────────────────────────────────────────────────────────
        macd_line, macd_sig, macd_hist = _macd(close)
        macd_bull = macd_line > macd_sig

        # ── 6. ADX ────────────────────────────────────────────────────────────
        adx, di_plus, di_minus = _adx(high, low, close)
        trending   = adx > 20
        strong_trend = adx > 30

        # ── 7. 52-week position ───────────────────────────────────────────────
        lookback   = close.iloc[-252:] if len(close) >= 252 else close
        hi52       = float(lookback.max())
        lo52       = float(lookback.min())
        pos52      = round((price - lo52) / (hi52 - lo52) * 100, 1) if hi52 != lo52 else 50.0

        # ── 8. Vote scoring ───────────────────────────────────────────────────
        votes = []
        reasons = []

        def vote(cond, bull_msg, bear_msg, weight=1):
            if cond is None:
                return
            if cond:
                votes.append(weight)
                reasons.append((1, bull_msg))
            else:
                votes.append(-weight)
                reasons.append((-1, bear_msg))

        vote(ret_1m and ret_1m > 0,       f"1M return: +{ret_1m}%",      f"1M return: {ret_1m}%")
        vote(ret_3m and ret_3m > 0,       f"3M return: +{ret_3m}%",      f"3M return: {ret_3m}%", weight=2)
        vote(ret_6m and ret_6m > 0,       f"6M return: +{ret_6m}%",      f"6M return: {ret_6m}%", weight=2)
        vote(ret_12m and ret_12m > 0,     f"12M return: +{ret_12m}%",    f"12M return: {ret_12m}%")
        vote(rs_3m and rs_3m > 0,         f"3M alpha vs SPY: +{rs_3m}%", f"3M lag vs SPY: {rs_3m}%", weight=2)
        vote(rs_6m and rs_6m > 0,         f"6M alpha vs SPY: +{rs_6m}%", f"6M lag vs SPY: {rs_6m}%", weight=2)
        vote(above_ema20,                 "Price above EMA20",            "Price below EMA20")
        vote(above_ema50,                 "Price above EMA50",            "Price below EMA50", weight=2)
        vote(above_ema200,                "Price above EMA200 (bull mkt)","Price below EMA200 (bear mkt)", weight=2)
        vote(golden_x,                    "EMA50 > EMA200 (golden cross)", "EMA50 < EMA200 (death cross)", weight=2)
        vote(macd_bull,                   f"MACD above signal ({macd_line:+.2f})", f"MACD below signal ({macd_line:+.2f})")
        vote(di_plus > di_minus,          f"+DI {di_plus:.0f} > -DI {di_minus:.0f}", f"+DI {di_plus:.0f} < -DI {di_minus:.0f}")

        net   = sum(votes)
        total = sum(abs(v) for v in votes)
        score = net / total if total else 0   # -1 to +1

        # ── 9. Direction ──────────────────────────────────────────────────────
        if score > 0.15:
            direction = 1
        elif score < -0.15:
            direction = -1
        else:
            direction = 0

        # ── 10. Confidence ────────────────────────────────────────────────────
        # Base: |score| mapped to 0-70
        base_conf  = abs(score) * 70

        # ADX modifier: strong trend boosts confidence
        if strong_trend:
            adx_mod = 25
        elif trending:
            adx_mod = 12
        else:
            adx_mod = -10   # weak trend hurts momentum signals

        confidence = round(max(15.0, min(93.0, base_conf + adx_mod)), 1)
        if direction == 0:
            confidence = min(confidence, 35.0)

        # ── 11. Regime label ──────────────────────────────────────────────────
        trend_str = "Strong" if strong_trend else "Moderate" if trending else "Weak"
        if direction == 1:
            regime = f"Uptrend — {trend_str} ({adx:.0f} ADX)"
        elif direction == -1:
            regime = f"Downtrend — {trend_str} ({adx:.0f} ADX)"
        else:
            regime = f"No Clear Trend ({adx:.0f} ADX)"

        # ── 12. Signals (top 6 most informative) ─────────────────────────────
        bull_reasons = [r[1] for r in reasons if r[0] == 1]
        bear_reasons = [r[1] for r in reasons if r[0] == -1]

        signals = []
        if direction == 1:
            signals = bull_reasons[:4] + bear_reasons[:2]
        elif direction == -1:
            signals = bear_reasons[:4] + bull_reasons[:2]
        else:
            signals = bull_reasons[:3] + bear_reasons[:3]

        signals.append(f"ADX: {adx:.0f} — {'strong trend' if strong_trend else 'trending' if trending else 'no trend / choppy'}")
        signals.append(f"52-week position: {pos52:.0f}% (100=52w high, 0=52w low)")
        if fresh_cross:
            cross_type = "🟢 Fresh Golden Cross" if golden_x else "🔴 Fresh Death Cross"
            signals.insert(0, cross_type)

        # ── 13. Summary ───────────────────────────────────────────────────────
        bull_ct = sum(1 for r in reasons if r[0] == 1)
        bear_ct = sum(1 for r in reasons if r[0] == -1)
        ret_str = f"+{ret_3m}%" if ret_3m and ret_3m > 0 else f"{ret_3m}%"

        if direction == 1:
            summary = (
                f"{ticker} shows bullish momentum: {bull_ct}/{bull_ct+bear_ct} signals agree. "
                f"3M return {ret_str}, {'+' if rs_3m and rs_3m>0 else ''}{rs_3m}% vs SPY. "
                f"ADX {adx:.0f} — {'strong persistent trend' if strong_trend else 'moderate trend — watch for fade'}."
            )
        elif direction == -1:
            summary = (
                f"{ticker} shows bearish momentum: {bear_ct}/{bull_ct+bear_ct} signals negative. "
                f"3M return {ret_str}, {rs_3m}% vs SPY. "
                f"ADX {adx:.0f} — {'strong downtrend' if strong_trend else 'moderate selling — not yet capitulation'}."
            )
        else:
            summary = (
                f"{ticker} has no clear directional momentum (score {score:+.2f}). "
                f"{bull_ct} bullish vs {bear_ct} bearish signals — market is indecisive. "
                f"ADX {adx:.0f} confirms {'choppy, non-trending conditions' if not trending else 'weak trend'}."
            )

        # ── 14. Chart data ────────────────────────────────────────────────────
        price_series = [
            {
                "date":   d,
                "price":  round(float(p), 2),
                "ema20":  round(float(e20v), 2),
                "ema50":  round(float(e50v), 2),
                "ema200": round(float(e200v), 2) if not np.isnan(e200v) else None,
            }
            for d, p, e20v, e50v, e200v in zip(
                close.index.strftime("%Y-%m-%d").tolist()[-180:],
                close.values[-180:],
                ema20.values[-180:],
                ema50.values[-180:],
                ema200.values[-180:],
            )
        ]

        # MACD series
        fast_s   = _ema(close, 12)
        slow_s   = _ema(close, 26)
        macd_s   = fast_s - slow_s
        signal_s = _ema(macd_s, 9)
        hist_s   = macd_s - signal_s
        macd_series = [
            {
                "date":    d,
                "macd":    round(float(m), 3),
                "signal":  round(float(sig), 3),
                "hist":    round(float(h), 3),
            }
            for d, m, sig, h in zip(
                close.index.strftime("%Y-%m-%d").tolist()[-120:],
                macd_s.values[-120:],
                signal_s.values[-120:],
                hist_s.values[-120:],
            )
        ]

        return QuantResult(
            ticker     = ticker.upper(),
            model_id   = self.id,
            model_name = self.name,
            direction  = direction,
            confidence = confidence,
            regime     = regime,
            summary    = summary,
            signals    = signals,
            chart_data = {
                "price_series": price_series,
                "macd_series":  macd_series,
            },
            meta = {
                "score":          round(score, 3),
                "bull_votes":     bull_ct,
                "bear_votes":     bear_ct,
                "ret_1m":         ret_1m,
                "ret_3m":         ret_3m,
                "ret_6m":         ret_6m,
                "ret_12m":        ret_12m,
                "rs_3m_vs_spy":   rs_3m,
                "rs_6m_vs_spy":   rs_6m,
                "adx":            adx,
                "di_plus":        di_plus,
                "di_minus":       di_minus,
                "above_ema20":    above_ema20,
                "above_ema50":    above_ema50,
                "above_ema200":   above_ema200,
                "golden_cross":   golden_x,
                "macd_bull":      macd_bull,
                "pos_52w_pct":    pos52,
                "hi_52w":         round(hi52, 2),
                "lo_52w":         round(lo52, 2),
            },
        )
