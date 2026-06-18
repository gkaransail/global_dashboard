"""
Mean Reversion model.

Four complementary lenses on the same question — "is price stretched and likely to snap back?":

  1. Z-score  — how many std-devs is price from its 20d / 50d rolling mean
  2. Bollinger Band %B — price position within the 2σ band
  3. Ornstein-Uhlenbeck half-life — how quickly the series historically reverts
  4. ADF test — statistical evidence that the log-price series is mean-reverting at all

Direction:
  Bullish  (−1)  — price far below mean, expect upward reversion
  Bearish  (+1)  — price far above mean, expect downward reversion
  Neutral  ( 0)  — price near mean, no reversion trade available

Confidence is reduced when:
  - ADF fails to reject the unit-root hypothesis (series not stationary)
  - Half-life > 30 trading days (slow reversion, noisy signal)
  - Mixed z-scores across the two windows
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf
from statsmodels.tsa.stattools import adfuller
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


def _rsi(series: pd.Series, period: int = 14) -> float:
    delta = series.diff().dropna()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    rsi   = (100 - 100 / (1 + rs)).iloc[-1]
    return round(float(rsi), 1) if not np.isnan(rsi) else 50.0


def _ou_half_life(log_prices: pd.Series) -> float:
    """
    Estimate Ornstein-Uhlenbeck half-life via OLS regression:
        Δlog_price = α + β · log_price(t-1) + ε
    half_life = -log(2) / log(1 + β)
    A negative β implies mean reversion.
    """
    y  = log_prices.diff().dropna()
    x  = log_prices.shift(1).dropna()
    y, x = y.align(x, join="inner")
    res  = OLS(y, add_constant(x)).fit()
    beta = res.params.iloc[1]
    if beta >= 0:
        return float("inf")   # no mean reversion
    hl = -np.log(2) / np.log(1 + beta)
    return max(float(hl), 0.5)


class MeanReversionModel(QuantModel):
    id          = "mean_reversion"
    name        = "Mean Reversion"
    description = (
        "Z-score, Bollinger %B, Ornstein-Uhlenbeck half-life, and ADF stationarity test. "
        "Signals when price is stretched and statistically likely to revert."
    )
    category    = "reversion"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Price data ─────────────────────────────────────────────────────
        hist = yf.Ticker(ticker).history(period="1y")
        if len(hist) < 60:
            raise ValueError(f"Insufficient price history for {ticker}")

        close  = hist["Close"]
        dates  = close.index.strftime("%Y-%m-%d").tolist()

        # ── 2. Z-scores (20d and 50d windows) ────────────────────────────────
        def zscore(series, window):
            mu  = series.rolling(window).mean()
            sig = series.rolling(window).std()
            return ((series - mu) / sig).iloc[-1]

        z20 = zscore(close, 20)
        z50 = zscore(close, 50)

        # ── 3. Bollinger Band %B (20d, 2σ) ───────────────────────────────────
        mu20   = close.rolling(20).mean()
        sig20  = close.rolling(20).std()
        upper  = mu20 + 2 * sig20
        lower  = mu20 - 2 * sig20
        pct_b  = ((close - lower) / (upper - lower)).iloc[-1]
        pct_b  = float(np.clip(pct_b, -0.1, 1.1))

        current_price = float(close.iloc[-1])
        mean_20       = float(mu20.iloc[-1])
        mean_50       = float(close.rolling(50).mean().iloc[-1])
        band_width    = float((upper.iloc[-1] - lower.iloc[-1]) / mu20.iloc[-1] * 100)

        # ── 4. RSI ────────────────────────────────────────────────────────────
        rsi = _rsi(close)

        # ── 5. OU half-life ───────────────────────────────────────────────────
        log_px  = np.log(close)
        half_life = _ou_half_life(log_px)
        hl_finite = half_life < 252   # within 1 trading year

        # ── 6. ADF stationarity test on log-prices ────────────────────────────
        adf_result = adfuller(log_px.dropna(), autolag="AIC")
        adf_stat, adf_pval = float(adf_result[0]), float(adf_result[1])
        adf_reject = adf_pval < 0.05   # reject unit root → stationary / mean-reverting

        # ── 7. Direction & strength ───────────────────────────────────────────
        # Use z20 as primary signal; z50 as confirmation
        z_avg = (z20 + z50) / 2

        if z_avg < -1.0 and pct_b < 0.25:
            direction  = 1    # stretched below → expect rally
            strength   = "Strong" if z_avg < -1.5 else "Moderate"
        elif z_avg > 1.0 and pct_b > 0.75:
            direction  = -1   # stretched above → expect pullback
            strength   = "Strong" if z_avg > 1.5 else "Moderate"
        else:
            direction  = 0
            strength   = "Weak"

        # ── 8. Confidence ─────────────────────────────────────────────────────
        # Base: z-score magnitude mapped to 0-100
        z_conf   = min(abs(z_avg) / 2.5, 1.0) * 60     # up to 60 from z-score

        # ADF bonus: stationary series are more likely to revert
        adf_conf = 20 if adf_reject else 0

        # Half-life bonus: short half-life = faster reversion
        if hl_finite:
            hl_conf = max(0, (1 - half_life / 60)) * 20  # up to 20 for HL<60d
        else:
            hl_conf = 0

        confidence = round(max(15.0, min(92.0, z_conf + adf_conf + hl_conf)), 1)

        # Penalise when z20 and z50 disagree on direction
        if z20 * z50 < 0:
            confidence = round(confidence * 0.75, 1)

        if direction == 0:
            confidence = min(confidence, 35.0)

        # ── 9. Regime label ───────────────────────────────────────────────────
        dev_pct = (current_price - mean_20) / mean_20 * 100
        if direction == 1:
            regime = f"Oversold — {abs(dev_pct):.1f}% below 20d mean"
        elif direction == -1:
            regime = f"Overbought — {dev_pct:.1f}% above 20d mean"
        else:
            regime = f"Near Mean ({dev_pct:+.1f}% vs 20d)"

        # ── 10. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Z-score (20d): {z20:+.2f}  |  Z-score (50d): {z50:+.2f}",
            f"Bollinger %B: {pct_b:.2f}  (0=lower band, 1=upper band)",
            f"RSI (14): {rsi}  {'— oversold' if rsi < 35 else '— overbought' if rsi > 65 else ''}",
            f"OU half-life: {f'{half_life:.1f} trading days' if hl_finite else 'no mean reversion detected'}",
            f"ADF test: p={adf_pval:.3f} — {'✓ stationary (mean-reverting)' if adf_reject else '✗ unit root — series not stationary'}",
            f"Bollinger band width: {band_width:.1f}% of price  {'(compressed — breakout risk)' if band_width < 5 else ''}",
        ]
        if z20 * z50 < 0:
            signals.append("⚠️ 20d and 50d z-scores disagree — mixed signal, reduced confidence")

        # ── 11. Summary ───────────────────────────────────────────────────────
        hl_str = f"{half_life:.0f}d" if hl_finite else "no clear OU reversion"
        if direction == 1:
            summary = (
                f"{ticker} is {abs(dev_pct):.1f}% below its 20-day mean with a z-score of {z_avg:+.2f}. "
                f"Bollinger %B of {pct_b:.2f} confirms the price is near the lower band. "
                f"OU half-life is {hl_str} — mean reversion trade has a {'fast' if hl_finite and half_life < 15 else 'moderate'} expected decay."
            )
        elif direction == -1:
            summary = (
                f"{ticker} is {dev_pct:.1f}% above its 20-day mean with a z-score of {z_avg:+.2f}. "
                f"Bollinger %B of {pct_b:.2f} confirms the price is near the upper band. "
                f"OU half-life is {hl_str} — a pullback reversion is {'likely soon' if hl_finite and half_life < 15 else 'possible but may take time'}."
            )
        else:
            summary = (
                f"{ticker} is trading close to its mean (z={z_avg:+.2f}, %B={pct_b:.2f}). "
                f"No meaningful reversion opportunity — price is not statistically stretched in either direction."
            )

        # ── 12. Chart data ────────────────────────────────────────────────────
        z20_series = ((close - close.rolling(20).mean()) / close.rolling(20).std()).dropna()
        price_series = [
            {"date": d, "price": round(float(p), 2), "upper": round(float(u), 2),
             "lower": round(float(l), 2), "mean": round(float(m), 2)}
            for d, p, u, l, m in zip(
                close.index.strftime("%Y-%m-%d").tolist()[-180:],
                close.values[-180:],
                upper.values[-180:],
                lower.values[-180:],
                mu20.values[-180:],
            )
        ]
        z_series = [
            {"date": d, "z": round(float(z), 3)}
            for d, z in zip(z20_series.index.strftime("%Y-%m-%d").tolist()[-180:],
                            z20_series.values[-180:])
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
                "z_series":     z_series,
            },
            meta = {
                "z_score_20d":       round(float(z20), 3),
                "z_score_50d":       round(float(z50), 3),
                "pct_b":             round(pct_b, 3),
                "rsi":               rsi,
                "half_life_days":    round(half_life, 1) if hl_finite else None,
                "adf_pvalue":        round(adf_pval, 4),
                "adf_stationary":    adf_reject,
                "band_width_pct":    round(band_width, 2),
                "price":             round(current_price, 2),
                "mean_20d":          round(mean_20, 2),
                "mean_50d":          round(mean_50, 2),
                "strength":          strength,
            },
        )
