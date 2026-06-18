"""
Volatility Regime model.

Classifies the current vol environment (Low / Normal / Elevated / High / Extreme)
and signals what that implies for the stock: calm markets favour upside momentum;
high/expanding vol signals elevated risk and potential drawdown.

Five lenses:
  1. VIX level + 1-year percentile    — macro fear gauge
  2. Realized vol (10d / 21d / 63d)   — actual stock volatility at multiple horizons
  3. Parkinson vol estimator          — high-low range-based vol (2× more efficient)
  4. Vol trend (expansion / contraction) — is vol rising or falling?
  5. ATR percentile                   — where today's daily range sits vs history

Direction:
  Bullish ( 1) — low/contracting vol → calm conditions favour upside
  Bearish (-1) — high/expanding vol  → elevated risk, potential drawdown
  Neutral ( 0) — normal vol, no strong regime signal

Confidence is highest when multiple vol measures agree on the same regime.
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# VIX regime thresholds
VIX_LOW      = 15
VIX_NORMAL   = 20
VIX_ELEVATED = 25
VIX_HIGH     = 30
VIX_EXTREME  = 40


def _realized_vol(log_ret: pd.Series, window: int) -> float:
    """Annualised close-to-close realized vol."""
    return float(log_ret.rolling(window).std().iloc[-1] * np.sqrt(252) * 100)


def _parkinson_vol(high: pd.Series, low: pd.Series, window: int = 21) -> float:
    """
    Parkinson (1980) range-based estimator — uses high/low instead of close-to-close.
    Roughly 2× more efficient; does not capture overnight gaps.
    """
    hl_sq = (np.log(high / low) ** 2) / (4 * np.log(2))
    pv    = np.sqrt(hl_sq.rolling(window).mean() * 252) * 100
    return float(pv.iloc[-1])


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def _percentile(series: pd.Series, value: float) -> float:
    return float((series < value).mean() * 100)


class VolatilityRegimeModel(QuantModel):
    id          = "volatility_regime"
    name        = "Volatility Regime"
    description = (
        "VIX percentile, realized vol (10d/21d/63d), Parkinson estimator, "
        "vol trend (expanding/contracting), and ATR percentile."
    )
    category    = "volatility"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch stock + VIX history ──────────────────────────────────────
        t       = yf.Ticker(ticker)
        hist    = t.history(period="2y")
        vix_hist = yf.Ticker("^VIX").history(period="1y")

        if len(hist) < 70:
            raise ValueError(f"Insufficient price history for {ticker}")

        close  = hist["Close"]
        high   = hist["High"]
        low    = hist["Low"]
        log_ret = np.log(close / close.shift(1)).dropna()

        # ── 2. VIX analysis ───────────────────────────────────────────────────
        current_vix  = float(vix_hist["Close"].iloc[-1])
        vix_pct      = _percentile(vix_hist["Close"], current_vix)
        vix_1m_ago   = float(vix_hist["Close"].iloc[-22]) if len(vix_hist) >= 22 else current_vix
        vix_trending_up = current_vix > vix_1m_ago

        if current_vix < VIX_LOW:
            vix_regime = "Low"
        elif current_vix < VIX_NORMAL:
            vix_regime = "Normal"
        elif current_vix < VIX_ELEVATED:
            vix_regime = "Elevated"
        elif current_vix < VIX_HIGH:
            vix_regime = "High"
        elif current_vix < VIX_EXTREME:
            vix_regime = "Very High"
        else:
            vix_regime = "Extreme"

        # ── 3. Realized vol (stock-specific) ─────────────────────────────────
        rv10 = _realized_vol(log_ret, 10)
        rv21 = _realized_vol(log_ret, 21)
        rv63 = _realized_vol(log_ret, 63)

        # 1-year rv21 percentile for context
        rv21_series = log_ret.rolling(21).std() * np.sqrt(252) * 100
        rv_pct      = _percentile(rv21_series.dropna(), rv21)

        # ── 4. Parkinson vol ──────────────────────────────────────────────────
        park_vol = _parkinson_vol(high, low, window=21)

        # ── 5. Vol trend (expansion vs contraction) ───────────────────────────
        vol_expanding  = rv10 > rv21      # short-term vol above medium-term
        vol_accelerating = rv21 > rv63    # medium-term vol above long-term
        vol_term_structure = "expanding" if vol_expanding and vol_accelerating \
                             else "contracting" if not vol_expanding and not vol_accelerating \
                             else "mixed"

        # ── 6. ATR percentile ─────────────────────────────────────────────────
        atr_series = _atr(high, low, close, period=14)
        # Normalise ATR by price (% of price)
        atr_pct_series = (atr_series / close) * 100
        current_atr_pct = float(atr_pct_series.iloc[-1])
        atr_percentile  = _percentile(atr_pct_series.dropna().iloc[-252:], current_atr_pct)

        # ── 7. EWMA vol forecast (RiskMetrics λ=0.94) ─────────────────────────
        lam   = 0.94
        sq_ret = log_ret ** 2
        ewma_var = sq_ret.ewm(alpha=1 - lam, adjust=False).mean()
        ewma_vol = float(np.sqrt(ewma_var.iloc[-1] * 252) * 100)

        # ── 8. Composite vol score (0-100, higher = more volatile/risky) ──────
        # Normalise each metric to 0-100
        vix_score    = min(current_vix / VIX_EXTREME * 100, 100)
        rv_score     = min(rv21 / 80 * 100, 100)          # 80% annualised = extreme
        park_score   = min(park_vol / 80 * 100, 100)
        trend_score  = 80 if vol_expanding and vol_accelerating \
                      else 20 if not vol_expanding and not vol_accelerating \
                      else 50

        vol_composite = round(
            0.30 * vix_score +
            0.30 * rv_score +
            0.20 * park_score +
            0.20 * trend_score,
            1
        )

        # ── 9. Direction & regime label ───────────────────────────────────────
        if vol_composite < 30 and not vix_trending_up and vol_term_structure == "contracting":
            direction = 1
            regime    = f"Low Vol / Contracting — {vix_regime} VIX ({current_vix:.1f})"
        elif vol_composite > 60 or (vix_trending_up and current_vix > VIX_ELEVATED):
            direction = -1
            regime    = f"High Vol / Expanding — {vix_regime} VIX ({current_vix:.1f})"
        elif vol_composite < 40 and vol_term_structure != "expanding":
            direction = 1
            regime    = f"Calm — {vix_regime} VIX ({current_vix:.1f})"
        elif vol_composite > 50:
            direction = -1
            regime    = f"Elevated Risk — {vix_regime} VIX ({current_vix:.1f})"
        else:
            direction = 0
            regime    = f"Normal Vol — {vix_regime} VIX ({current_vix:.1f})"

        # ── 10. Confidence ────────────────────────────────────────────────────
        # High confidence when VIX percentile and RV percentile agree strongly
        pct_agreement = 1 - abs(vix_pct - rv_pct) / 100    # 1 = perfect agreement
        extreme_bonus = max(0, (abs(vol_composite - 50) - 10) / 40) * 20  # extreme regimes = clearer signal
        base_conf     = abs(vol_composite - 50) * 1.2       # deviation from neutral
        confidence    = round(max(20.0, min(92.0, base_conf + extreme_bonus + pct_agreement * 10)), 1)

        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 11. Signals ───────────────────────────────────────────────────────
        signals = [
            f"VIX: {current_vix:.1f} ({vix_regime}) — {vix_pct:.0f}th percentile vs 1y",
            f"VIX trend: {'↑ rising vs 1M ago ({:.1f})'.format(vix_1m_ago) if vix_trending_up else '↓ falling vs 1M ago ({:.1f})'.format(vix_1m_ago)}",
            f"Realized vol — 10d: {rv10:.1f}%  21d: {rv21:.1f}%  63d: {rv63:.1f}% (annualised)",
            f"Alt vol estimator: {'Parkinson' if abs(park_vol - rv21) >= abs(ewma_vol - rv21) else 'EWMA'} "
            f"{park_vol:.1f}% vs close-to-close {rv21:.1f}% "
            f"({'higher — gaps/ranges elevated' if max(park_vol, ewma_vol) > rv21 else 'lower — calm intraday'})  "
            f"[Parkinson: {park_vol:.1f}%  EWMA: {ewma_vol:.1f}%]",
            f"Vol term structure: {vol_term_structure} (10d {'>' if vol_expanding else '<'} 21d {'>' if vol_accelerating else '<'} 63d)",
            f"ATR %price: {current_atr_pct:.2f}% — {atr_percentile:.0f}th percentile vs 1y",
            f"Composite vol score: {vol_composite}/100 ({'low risk' if vol_composite < 35 else 'elevated risk' if vol_composite > 60 else 'moderate'})",
        ]

        # ── 12. Summary ───────────────────────────────────────────────────────
        if direction == 1:
            summary = (
                f"{ticker} is in a low/calm volatility regime. "
                f"VIX at {current_vix:.1f} ({vix_pct:.0f}th pct), stock realized vol {rv21:.1f}% (21d). "
                f"Vol is {vol_term_structure} — calm conditions tend to favour upside momentum and trend-following strategies."
            )
        elif direction == -1:
            summary = (
                f"{ticker} is in an elevated/high volatility regime. "
                f"VIX at {current_vix:.1f} ({vix_pct:.0f}th pct), stock realized vol {rv21:.1f}% (21d). "
                f"Vol is {vol_term_structure} — elevated uncertainty favours caution; mean reversion over momentum."
            )
        else:
            summary = (
                f"{ticker} is in a normal volatility regime (composite score {vol_composite}/100). "
                f"VIX at {current_vix:.1f}, realized vol {rv21:.1f}%. "
                f"No strong vol signal — conditions are neither particularly calm nor stressed."
            )

        # ── 13. Chart data ────────────────────────────────────────────────────
        # Rolling realized vol series for chart
        rv10_series = (log_ret.rolling(10).std() * np.sqrt(252) * 100).dropna()
        rv21_series_full = (log_ret.rolling(21).std() * np.sqrt(252) * 100).dropna()
        rv63_series = (log_ret.rolling(63).std() * np.sqrt(252) * 100).dropna()

        # Align on common index
        vol_df = pd.DataFrame({
            "rv10": rv10_series,
            "rv21": rv21_series_full,
            "rv63": rv63_series,
        }).dropna().iloc[-180:]

        vol_series = [
            {
                "date": d,
                "rv10": round(float(r10), 2),
                "rv21": round(float(r21), 2),
                "rv63": round(float(r63), 2),
            }
            for d, r10, r21, r63 in zip(
                vol_df.index.strftime("%Y-%m-%d"),
                vol_df["rv10"],
                vol_df["rv21"],
                vol_df["rv63"],
            )
        ]

        # VIX history
        vix_series = [
            {"date": d, "vix": round(float(v), 2)}
            for d, v in zip(
                vix_hist.index.strftime("%Y-%m-%d").tolist(),
                vix_hist["Close"].values,
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
                "vol_series": vol_series,
                "vix_series": vix_series,
            },
            meta = {
                "vix":              round(current_vix, 2),
                "vix_regime":       vix_regime,
                "vix_percentile":   round(vix_pct, 1),
                "vix_trending_up":  vix_trending_up,
                "rv10":             round(rv10, 2),
                "rv21":             round(rv21, 2),
                "rv63":             round(rv63, 2),
                "rv_percentile":    round(rv_pct, 1),
                "parkinson_vol":    round(park_vol, 2),
                "ewma_vol":         round(ewma_vol, 2),
                "atr_pct":          round(current_atr_pct, 3),
                "atr_percentile":   round(atr_percentile, 1),
                "vol_term_structure": vol_term_structure,
                "vol_composite":    vol_composite,
            },
        )
