"""
GARCH(1,1) Volatility Model.

Fits a GARCH(1,1) with constant mean on daily log-returns and provides:
  - Current conditional volatility (annualised %)
  - 10-day ahead volatility forecast
  - Model parameters: ω, α, β, persistence (α+β)
  - Long-run (unconditional) volatility
  - Vol regime: expanding / contracting vs long-run mean

Direction:
  Bullish  ( 1) — conditional vol below long-run AND forecast declining (vol contracting)
  Bearish  (-1) — conditional vol above long-run AND forecast rising (vol expanding)
  Neutral  ( 0) — near long-run vol with no clear momentum
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


def _percentile(series: pd.Series, value: float) -> float:
    return float((series < value).mean() * 100)


class GarchModel(QuantModel):
    id          = "garch"
    name        = "GARCH(1,1)"
    description = (
        "Fits GARCH(1,1) to daily returns. Reports conditional vol, persistence (α+β), "
        "long-run vol, and a 10-day forecast of expected volatility."
    )
    category    = "volatility"
    timeframe   = "short"

    def analyze(self, ticker: str) -> QuantResult:
        from arch import arch_model as arch_build

        # ── 1. Fetch price history ─────────────────────────────────────────────
        hist = yf.Ticker(ticker).history(period="2y")
        if len(hist) < 100:
            raise ValueError(f"Insufficient price history for {ticker}")

        close   = hist["Close"]
        log_ret = np.log(close / close.shift(1)).dropna()

        # Rescale to % — keeps GARCH parameters on a tractable numerical scale
        ret_pct = log_ret * 100

        # ── 2. Fit GARCH(1,1) ─────────────────────────────────────────────────
        garch = arch_build(ret_pct, vol="Garch", p=1, q=1, mean="Constant", dist="normal")
        res   = garch.fit(disp="off", options={"maxiter": 500})

        omega       = float(res.params["omega"])
        alpha       = float(res.params["alpha[1]"])
        beta        = float(res.params["beta[1]"])
        persistence = round(alpha + beta, 4)

        # Long-run (unconditional) variance and annualised vol
        if persistence < 1.0:
            lr_var = omega / (1.0 - alpha - beta)
            lr_vol = float(np.sqrt(lr_var * 252))
        else:
            # IGARCH — use sample variance as proxy
            lr_vol = float(np.sqrt(ret_pct.var() * 252))

        # Conditional vol series (annualised %)
        cond_vol_ann = res.conditional_volatility * np.sqrt(252)
        current_vol  = float(cond_vol_ann.iloc[-1])

        # ── 3. 10-day ahead forecast ──────────────────────────────────────────
        fc      = res.forecast(horizon=10, reindex=False)
        fc_var  = fc.variance.iloc[-1].values      # daily variance in (%/day)^2
        fc_vol  = np.sqrt(fc_var * 252)            # annualised %
        fc_avg  = float(fc_vol.mean())
        fc_slope = float(fc_vol[-1] - fc_vol[0])  # positive = rising

        # ── 4. Diagnostics ────────────────────────────────────────────────────
        vol_pct     = _percentile(cond_vol_ann.dropna(), current_vol)
        std_resid   = float(res.std_resid.std())
        loglik      = float(res.loglikelihood)

        # ── 5. Direction ──────────────────────────────────────────────────────
        below_lr    = current_vol < lr_vol
        forecast_up = fc_slope > 0.2
        forecast_dn = fc_slope < -0.2

        if below_lr and forecast_dn:
            direction = 1
            regime    = f"Vol Contracting — {current_vol:.1f}% < LR {lr_vol:.1f}%"
        elif below_lr and not forecast_up:
            # Below long-run but not accelerating
            direction = 1
            regime    = f"Suppressed Vol — {current_vol:.1f}% vs LR {lr_vol:.1f}%"
        elif not below_lr and forecast_up:
            direction = -1
            regime    = f"Vol Expanding — {current_vol:.1f}% > LR {lr_vol:.1f}%"
        elif not below_lr and current_vol > lr_vol * 1.2:
            direction = -1
            regime    = f"Elevated Vol — {current_vol:.1f}% vs LR {lr_vol:.1f}%"
        else:
            direction = 0
            regime    = f"Near Long-Run — {current_vol:.1f}% ≈ LR {lr_vol:.1f}%"

        # ── 6. Confidence ─────────────────────────────────────────────────────
        deviation   = abs(current_vol - lr_vol) / max(lr_vol, 1) * 100
        pers_boost  = max(0.0, (persistence - 0.85) / 0.14) * 15  # 0-15 when persistence 0.85-0.99
        slope_boost = min(15.0, abs(fc_slope) * 3.0)
        base_conf   = min(60.0, deviation * 0.8)
        confidence  = round(max(20.0, min(90.0, base_conf + pers_boost + slope_boost)), 1)
        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 7. Signals ────────────────────────────────────────────────────────
        signals = [
            f"Parameters — ω: {omega:.5f}  α: {alpha:.4f}  β: {beta:.4f}",
            f"Persistence α+β: {persistence:.4f}{'  — near-integrated (shocks persistent)' if persistence > 0.97 else ''}",
            f"Long-run unconditional vol: {lr_vol:.1f}% (annualised)",
            f"Current conditional vol: {current_vol:.1f}% — {vol_pct:.0f}th percentile vs 2y history",
            f"10-day forecast: avg {fc_avg:.1f}%  trend {'↑ +' if fc_slope > 0 else '↓ '}{abs(fc_slope):.2f}% over 10 days",
            f"Model fit — log-likelihood: {loglik:.1f}  residual std: {std_resid:.3f} (ideal ≈ 1.0)",
        ]

        # ── 8. Summary ────────────────────────────────────────────────────────
        if direction == 1:
            summary = (
                f"{ticker}'s GARCH(1,1) conditional vol ({current_vol:.1f}%) is below "
                f"its long-run average ({lr_vol:.1f}%) with a {'declining' if fc_slope < 0 else 'stable'} 10-day forecast. "
                f"Persistence α+β = {persistence:.3f} — vol shocks carry forward but conditions favour calm."
            )
        elif direction == -1:
            summary = (
                f"{ticker}'s GARCH(1,1) conditional vol ({current_vol:.1f}%) is above "
                f"its long-run average ({lr_vol:.1f}%) and the forecast is {'rising' if fc_slope > 0 else 'still elevated'}. "
                f"Persistence α+β = {persistence:.3f} — elevated uncertainty expected to persist near-term."
            )
        else:
            summary = (
                f"{ticker}'s GARCH(1,1) conditional vol ({current_vol:.1f}%) is near its long-run average ({lr_vol:.1f}%). "
                f"Persistence = {persistence:.3f}. No strong vol expansion or contraction signal."
            )

        # ── 9. Chart data ─────────────────────────────────────────────────────
        hist_series = cond_vol_ann.dropna().iloc[-180:]
        hist_dates  = hist_series.index.strftime("%Y-%m-%d").tolist()
        hist_vals   = [round(float(v), 2) for v in hist_series.values]

        last_date      = log_ret.index[-1]
        fc_dates       = pd.bdate_range(start=last_date, periods=11)[1:]
        fc_dates_str   = fc_dates.strftime("%Y-%m-%d").tolist()

        return QuantResult(
            ticker     = ticker.upper(),
            model_id   = self.id,
            model_name = self.name,
            category   = self.category,
            timeframe  = self.timeframe,
            direction  = direction,
            confidence = confidence,
            regime     = regime,
            summary    = summary,
            signals    = signals,
            chart_data = {
                "cond_vol_series": [
                    {"date": d, "vol": v}
                    for d, v in zip(hist_dates, hist_vals)
                ],
                "forecast_series": [
                    {"date": d, "vol": round(float(v), 2)}
                    for d, v in zip(fc_dates_str, fc_vol)
                ],
                "lr_vol": round(lr_vol, 2),
                "anchor_vol": round(current_vol, 2),
            },
            meta = {
                "omega":            round(omega, 6),
                "alpha":            round(alpha, 4),
                "beta":             round(beta, 4),
                "persistence":      persistence,
                "lr_vol":           round(lr_vol, 2),
                "current_cond_vol": round(current_vol, 2),
                "vol_percentile":   round(vol_pct, 1),
                "fc_10d_avg":       round(fc_avg, 2),
                "fc_slope":         round(fc_slope, 3),
                "loglikelihood":    round(loglik, 1),
                "std_resid_std":    round(std_resid, 3),
            },
        )
