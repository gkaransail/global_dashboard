"""
Momentum / Trend-Following model.

Three scored buckets that together answer: "is this stock in a strong, persistent trend?":

  1. Returns bucket  (40%)  — raw price momentum over 1M/3M/6M/12M lookbacks
  2. Rel. strength   (35%)  — 3M and 6M returns vs SPY benchmark
  3. Technical       (25%)  — EMA position stack, MACD crossover, ADX, golden/death cross

Each bucket scores from -1 to +1. Weighted average determines direction.
ADX gates confidence — weak ADX penalises regardless of vote result.
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
    fast   = _ema(close, 12)
    slow   = _ema(close, 26)
    line   = fast - slow
    signal = _ema(line, 9)
    return float(line.iloc[-1]), float(signal.iloc[-1])


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14):
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
    dx  = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan)
    adx = dx.ewm(span=period, adjust=False).mean()
    return round(float(adx.iloc[-1]), 1), round(float(di_plus.iloc[-1]), 1), round(float(di_minus.iloc[-1]), 1)


def _return_n(close: pd.Series, n: int):
    if len(close) < n + 1:
        return None
    return round(float((close.iloc[-1] / close.iloc[-(n + 1)] - 1) * 100), 2)


class MomentumModel(QuantModel):
    id          = "momentum"
    name        = "Momentum / Trend"
    description = (
        "Three scored buckets: raw returns (1M–12M), relative strength vs SPY, "
        "and technical indicators (EMA stack, MACD, ADX, golden cross)."
    )
    category    = "momentum"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch price data ───────────────────────────────────────────────
        t      = yf.Ticker(ticker)
        spy    = yf.Ticker("SPY")
        hist   = t.history(period="18mo")
        s_hist = spy.history(period="18mo")

        if len(hist) < 60:
            raise ValueError(f"Insufficient price history for {ticker}")

        close = hist["Close"]
        high  = hist["High"]
        low   = hist["Low"]

        # ── 2. Bucket 1: Returns (40%) ────────────────────────────────────────
        ret_1m  = _return_n(close, 21)
        ret_3m  = _return_n(close, 63)
        ret_6m  = _return_n(close, 126)
        ret_12m = _return_n(close, 252)

        ret_votes = []
        ret_detail = []
        for ret, label, w in [(ret_1m, "1M", 1), (ret_3m, "3M", 2),
                               (ret_6m, "6M", 2), (ret_12m, "12M", 1)]:
            if ret is not None:
                sign = 1 if ret > 0 else -1
                ret_votes.extend([sign] * w)
                pfx = "+" if ret > 0 else ""
                ret_detail.append(f"{label}: {pfx}{ret}%")

        bucket_returns = (sum(ret_votes) / len(ret_votes)) if ret_votes else 0.0

        # ── 3. Bucket 2: Relative strength vs SPY (35%) ──────────────────────
        def rel_strength(n):
            if len(s_hist) < n + 1 or len(close) < n + 1:
                return None
            tkr_r = (close.iloc[-1] / close.iloc[-(n+1)] - 1) * 100
            spy_r = (s_hist["Close"].iloc[-1] / s_hist["Close"].iloc[-(n+1)] - 1) * 100
            return round(float(tkr_r - spy_r), 2)

        rs_3m = rel_strength(63)
        rs_6m = rel_strength(126)

        rs_votes = []
        rs_detail = []
        for rs, label in [(rs_3m, "3M"), (rs_6m, "6M")]:
            if rs is not None:
                rs_votes.append(1 if rs > 0 else -1)
                pfx = "+" if rs > 0 else ""
                rs_detail.append(f"{label} vs SPY: {pfx}{rs}%")

        bucket_rs = (sum(rs_votes) / len(rs_votes)) if rs_votes else 0.0

        # ── 4. Bucket 3: Technical indicators (25%) ───────────────────────────
        ema20  = _ema(close, 20)
        ema50  = _ema(close, 50)
        ema200 = _ema(close, 200)

        price      = float(close.iloc[-1])
        e20        = float(ema20.iloc[-1])
        e50        = float(ema50.iloc[-1])
        e200       = float(ema200.iloc[-1]) if len(close) >= 200 else None
        golden_x   = (e50 > e200) if e200 is not None else None

        above_ema20  = price > e20
        above_ema50  = price > e50
        above_ema200 = (price > e200) if e200 is not None else None

        macd_line, macd_sig = _macd(close)
        macd_bull = macd_line > macd_sig

        adx, di_plus, di_minus = _adx(high, low, close)
        trending      = adx > 20
        strong_trend  = adx > 30

        tech_votes = []
        tech_detail = []

        for cond, bull_msg, bear_msg, w in [
            (above_ema20,  "Above EMA20",            "Below EMA20",           1),
            (above_ema50,  "Above EMA50",             "Below EMA50",           2),
            (above_ema200, "Above EMA200 (bull mkt)", "Below EMA200 (bear mkt)", 2),
            (golden_x,     "EMA50>EMA200 (golden)",   "EMA50<EMA200 (death)",  2),
            (macd_bull,    f"MACD above signal",       "MACD below signal",     1),
            (di_plus > di_minus, f"+DI>{di_minus:.0f}", f"-DI>{di_plus:.0f}",  1),
        ]:
            if cond is None:
                continue
            sign = 1 if cond else -1
            tech_votes.extend([sign] * w)
            tech_detail.append(bull_msg if cond else bear_msg)

        bucket_tech = (sum(tech_votes) / len(tech_votes)) if tech_votes else 0.0

        # Fresh golden/death cross is a notable event
        prev_golden = None
        if len(close) >= 201 and e200 is not None:
            e50_prev  = float(ema50.iloc[-2])
            e200_prev = float(ema200.iloc[-2])
            prev_golden = e50_prev > e200_prev
        fresh_cross = (golden_x is not None and prev_golden is not None
                       and golden_x != prev_golden)

        # ── 5. Composite score ────────────────────────────────────────────────
        score = (0.40 * bucket_returns + 0.35 * bucket_rs + 0.25 * bucket_tech)

        # ── 6. Direction ──────────────────────────────────────────────────────
        if score > 0.15:
            direction = 1
        elif score < -0.15:
            direction = -1
        else:
            direction = 0

        # ── 7. Confidence ─────────────────────────────────────────────────────
        base_conf = abs(score) * 70
        if strong_trend:
            adx_mod = 25
        elif trending:
            adx_mod = 12
        else:
            adx_mod = -10

        confidence = round(max(15.0, min(93.0, base_conf + adx_mod)), 1)
        if direction == 0:
            confidence = min(confidence, 35.0)

        # ── 8. Regime label ───────────────────────────────────────────────────
        trend_str = "Strong" if strong_trend else "Moderate" if trending else "Weak"
        if direction == 1:
            regime = f"Uptrend — {trend_str} ({adx:.0f} ADX)"
        elif direction == -1:
            regime = f"Downtrend — {trend_str} ({adx:.0f} ADX)"
        else:
            regime = f"No Clear Trend ({adx:.0f} ADX)"

        # ── 9. 52-week position ───────────────────────────────────────────────
        lookback = close.iloc[-252:] if len(close) >= 252 else close
        hi52     = float(lookback.max())
        lo52     = float(lookback.min())
        pos52    = round((price - lo52) / (hi52 - lo52) * 100, 1) if hi52 != lo52 else 50.0

        # ── 10. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Returns bucket ({bucket_returns:+.2f}): {' | '.join(ret_detail) or 'n/a'}",
            f"Rel. strength bucket ({bucket_rs:+.2f}): {' | '.join(rs_detail) or 'n/a'}",
            f"Technical bucket ({bucket_tech:+.2f}): {', '.join(tech_detail[:3]) or 'n/a'}",
            f"Composite score: {score:+.2f} → {regime}",
            f"ADX: {adx:.0f} — {'strong trend' if strong_trend else 'trending' if trending else 'choppy / no trend'}",
            f"52-week position: {pos52:.0f}%  (100 = 52w high, 0 = 52w low)",
        ]
        if fresh_cross:
            cross_type = "Fresh Golden Cross (EMA50 crossed above EMA200)" if golden_x \
                         else "Fresh Death Cross (EMA50 crossed below EMA200)"
            signals.insert(0, cross_type)

        # ── 11. Summary ───────────────────────────────────────────────────────
        ret_str = f"+{ret_3m}%" if ret_3m and ret_3m > 0 else f"{ret_3m}%"
        rs_str  = f"{rs_3m:+.1f}%" if rs_3m is not None else "n/a"
        if direction == 1:
            summary = (
                f"{ticker} has bullish momentum (score {score:+.2f}). "
                f"3M return {ret_str}, {rs_str} vs SPY. "
                f"ADX {adx:.0f} — {'strong persistent trend' if strong_trend else 'moderate trend — watch for fade'}."
            )
        elif direction == -1:
            summary = (
                f"{ticker} has bearish momentum (score {score:+.2f}). "
                f"3M return {ret_str}, {rs_str} vs SPY. "
                f"ADX {adx:.0f} — {'strong downtrend' if strong_trend else 'moderate selling pressure'}."
            )
        else:
            summary = (
                f"{ticker} has no clear directional momentum (score {score:+.2f}). "
                f"Returns, relative strength, and technical signals are mixed. "
                f"ADX {adx:.0f} confirms {'choppy, non-trending conditions' if not trending else 'weak trend'}."
            )

        # ── 12. Chart data ────────────────────────────────────────────────────
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

        fast_s   = _ema(close, 12)
        slow_s   = _ema(close, 26)
        macd_s   = fast_s - slow_s
        signal_s = _ema(macd_s, 9)
        hist_s   = macd_s - signal_s
        macd_series = [
            {"date": d, "macd": round(float(m), 3), "signal": round(float(sig), 3), "hist": round(float(h), 3)}
            for d, m, sig, h in zip(
                close.index.strftime("%Y-%m-%d").tolist()[-120:],
                macd_s.values[-120:],
                signal_s.values[-120:],
                hist_s.values[-120:],
            )
        ]

        # Bucket bar chart data
        bucket_bars = [
            {"bucket": "Returns (40%)",    "score": round(bucket_returns, 3)},
            {"bucket": "Rel. Strength (35%)", "score": round(bucket_rs, 3)},
            {"bucket": "Technical (25%)",  "score": round(bucket_tech, 3)},
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
                "price_series":  price_series,
                "macd_series":   macd_series,
                "bucket_bars":   bucket_bars,
            },
            meta = {
                "score":          round(score, 3),
                "bucket_returns": round(bucket_returns, 3),
                "bucket_rs":      round(bucket_rs, 3),
                "bucket_tech":    round(bucket_tech, 3),
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
