"""
Multi-Factor Model (Fama-French inspired).

Decomposes stock returns into 5 systematic risk factors using OLS regression,
then isolates the stock's Jensen's alpha (idiosyncratic excess return).

Factor proxies (ETF-based, no data vendor required):
  MKT  = SPY excess return over risk-free rate
  SMB  = IWM − SPY   (Small-cap minus Large-cap)
  HML  = IVE − IVW   (Value minus Growth)
  MOM  = MTUM − SPY  (Momentum winners minus market)
  QMJ  = QUAL − SPY  (Quality/Profitability minus market)

Output:
  α   (Jensen's alpha)  — annualised excess return unexplained by factors
  β   (factor loadings) — sensitivity to each systematic factor
  R²  — how much of the stock's variance is explained by the 5 factors
  Residual vol          — idiosyncratic (stock-specific) risk

Direction:
  Bullish ( 1) — significant positive alpha or strongly favourable factor tilt
  Bearish (-1) — significant negative alpha or strongly adverse factor tilt
  Neutral ( 0) — alpha not significant and factors mixed
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

RF_DAILY = 0.05 / 252          # ~5% annual risk-free rate → daily

FACTORS = {
    "MKT":  ("SPY",  None),     # market excess return
    "SMB":  ("IWM",  "SPY"),    # size: small minus large
    "HML":  ("IVE",  "IVW"),    # value: value minus growth
    "MOM":  ("MTUM", "SPY"),    # momentum: momentum ETF minus market
    "QMJ":  ("QUAL", "SPY"),    # quality: quality ETF minus market
}

FACTOR_LABELS = {
    "MKT": "Market (β)",
    "SMB": "Size (small-cap tilt)",
    "HML": "Value (value tilt)",
    "MOM": "Momentum",
    "QMJ": "Quality/Profitability",
}

FACTOR_INTERP = {
    "MKT": ("high market sensitivity", "low market sensitivity / defensive"),
    "SMB": ("small-cap tilt",          "large-cap tilt"),
    "HML": ("value tilt",              "growth tilt"),
    "MOM": ("momentum exposure",       "anti-momentum / contrarian"),
    "QMJ": ("quality tilt",            "low-quality / speculative"),
}


class FactorModel(QuantModel):
    id          = "factor_model"
    name        = "Multi-Factor Model"
    description = (
        "Fama-French inspired 5-factor OLS decomposition: alpha, market beta, "
        "size (SMB), value (HML), momentum (MOM), quality (QMJ)."
    )
    category    = "factor"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Download price data ────────────────────────────────────────────
        all_tickers = [ticker, "SPY", "IWM", "IVE", "IVW", "MTUM", "QUAL"]
        raw = yf.download(all_tickers, period="2y", auto_adjust=True,
                          progress=False, threads=True)["Close"]
        raw = raw.dropna()

        if len(raw) < 120:
            raise ValueError(f"Insufficient overlapping price history for {ticker}")

        # ── 2. Daily log returns ──────────────────────────────────────────────
        rets = np.log(raw / raw.shift(1)).dropna()

        stock_ret = rets[ticker]
        spy_ret   = rets["SPY"]

        # Excess return of stock over RF
        y = stock_ret - RF_DAILY

        # ── 3. Build factor returns ───────────────────────────────────────────
        factor_df = pd.DataFrame(index=rets.index)
        factor_df["MKT"] = spy_ret - RF_DAILY
        factor_df["SMB"] = rets["IWM"]  - spy_ret
        factor_df["HML"] = rets["IVE"]  - rets["IVW"]
        factor_df["MOM"] = rets["MTUM"] - spy_ret
        factor_df["QMJ"] = rets["QUAL"] - spy_ret

        # Align y and X
        combined = pd.concat([y, factor_df], axis=1).dropna()
        y_clean  = combined.iloc[:, 0]
        X_clean  = combined.iloc[:, 1:]

        # ── 4. OLS regression ─────────────────────────────────────────────────
        result = OLS(y_clean, add_constant(X_clean)).fit()

        alpha_daily  = float(result.params["const"])
        alpha_annual = round(alpha_daily * 252 * 100, 2)   # annualised %
        alpha_tstat  = float(result.tvalues["const"])
        alpha_pval   = float(result.pvalues["const"])
        r_squared    = round(float(result.rsquared) * 100, 1)

        betas = {f: round(float(result.params[f]), 3) for f in FACTORS}
        tvals = {f: round(float(result.tvalues[f]), 2) for f in FACTORS}
        pvals = {f: round(float(result.pvalues[f]), 4) for f in FACTORS}

        # ── 5. Residual (idiosyncratic) vol ───────────────────────────────────
        resid_vol = round(float(result.resid.std() * np.sqrt(252) * 100), 2)

        # ── 6. Recent factor performance (last 63d) ───────────────────────────
        recent = factor_df.iloc[-63:].mean() * 252   # annualised recent factor return
        factor_contribution = {
            f: round(float(betas[f] * recent[f] * 100), 2) for f in FACTORS
        }
        total_factor_contribution = round(sum(factor_contribution.values()), 2)
        predicted_annual = round(alpha_annual + total_factor_contribution, 2)

        # ── 7. Direction ──────────────────────────────────────────────────────
        alpha_significant = alpha_pval < 0.10
        alpha_strong      = abs(alpha_annual) > 5

        if alpha_significant and alpha_strong:
            direction = 1 if alpha_annual > 0 else -1
        else:
            # Fall back to net factor contribution signal
            if total_factor_contribution > 3:
                direction = 1
            elif total_factor_contribution < -3:
                direction = -1
            else:
                direction = 0

        # ── 8. Confidence ─────────────────────────────────────────────────────
        # Higher when alpha is significant, R² is high (model fits well)
        alpha_conf  = min(abs(alpha_tstat) / 3 * 40, 40)    # up to 40 from t-stat
        r2_conf     = r_squared * 0.3                         # up to 30 from R²
        contrib_conf = min(abs(total_factor_contribution) / 10 * 20, 20)  # up to 20

        confidence = round(max(15.0, min(90.0, alpha_conf + r2_conf + contrib_conf)), 1)
        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 9. Regime label ───────────────────────────────────────────────────
        alpha_str = f"α={alpha_annual:+.1f}% p.a."
        sig_str   = f"(p={alpha_pval:.2f})" if not alpha_significant else f"★ (p={alpha_pval:.2f})"
        regime    = f"{alpha_str} {sig_str} · R²={r_squared}%"

        # ── 10. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Jensen's α: {alpha_annual:+.2f}% p.a. — t={alpha_tstat:.2f}, p={alpha_pval:.3f} "
            f"({'significant ★' if alpha_significant else 'not significant'})",
            f"R²: {r_squared}% — factors explain {r_squared:.0f}% of variance "
            f"(idiosyncratic vol: {resid_vol}% p.a.)",
        ]
        for f in FACTORS:
            interp = FACTOR_INTERP[f][0] if betas[f] > 0 else FACTOR_INTERP[f][1]
            sig    = " ★" if pvals[f] < 0.05 else ""
            signals.append(
                f"{FACTOR_LABELS[f]}: β={betas[f]:+.3f}{sig} — "
                f"recent contribution {factor_contribution[f]:+.1f}% p.a."
            )
        signals.append(
            f"Total factor contribution (63d): {total_factor_contribution:+.1f}% p.a. → "
            f"predicted return: {predicted_annual:+.1f}% p.a."
        )

        # ── 11. Summary ───────────────────────────────────────────────────────
        if alpha_significant:
            alpha_desc = f"statistically significant alpha of {alpha_annual:+.1f}% p.a. (p={alpha_pval:.2f})"
        else:
            alpha_desc = f"alpha of {alpha_annual:+.1f}% p.a. (not statistically significant, p={alpha_pval:.2f})"

        dom_factor = max(betas, key=lambda f: abs(betas[f]))
        dom_desc   = FACTOR_INTERP[dom_factor][0] if betas[dom_factor] > 0 else FACTOR_INTERP[dom_factor][1]

        summary = (
            f"{ticker} has a {alpha_desc}. "
            f"The 5-factor model explains {r_squared:.0f}% of its return variance (R²). "
            f"Dominant factor exposure: {FACTOR_LABELS[dom_factor]} (β={betas[dom_factor]:+.3f}) — {dom_desc}. "
            f"Net factor contribution over last 63 days: {total_factor_contribution:+.1f}% annualised."
        )

        # ── 12. Rolling alpha chart (63d window) ──────────────────────────────
        roll_alpha = []
        win = 63
        for i in range(win, len(combined)):
            window_y = combined.iloc[i - win:i, 0]
            window_X = combined.iloc[i - win:i, 1:]
            try:
                r = OLS(window_y, add_constant(window_X)).fit()
                roll_alpha.append({
                    "date":  combined.index[i].strftime("%Y-%m-%d"),
                    "alpha": round(float(r.params["const"]) * 252 * 100, 2),
                    "r2":    round(float(r.rsquared) * 100, 1),
                })
            except Exception:
                pass

        # Factor beta bars (static, for bar chart)
        factor_bars = [
            {"factor": FACTOR_LABELS[f], "beta": betas[f],
             "significant": pvals[f] < 0.05, "contribution": factor_contribution[f]}
            for f in FACTORS
        ]

        # Cumulative actual vs factor-explained return (last 252d)
        X_recent = add_constant(X_clean.iloc[-252:])
        fitted   = X_recent @ result.params
        actual_cum  = (y_clean.iloc[-252:]).cumsum() * 100
        fitted_cum  = fitted.cumsum() * 100
        cum_series  = [
            {"date": d, "actual": round(float(a), 2), "fitted": round(float(fi), 2)}
            for d, a, fi in zip(
                y_clean.index[-252:].strftime("%Y-%m-%d"),
                actual_cum.values,
                fitted_cum.values,
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
                "factor_bars":  factor_bars,
                "roll_alpha":   roll_alpha[-120:],   # last ~6 months of rolling alpha
                "cum_series":   cum_series,
            },
            meta = {
                "alpha_annual":    alpha_annual,
                "alpha_tstat":     round(alpha_tstat, 3),
                "alpha_pval":      round(alpha_pval, 4),
                "alpha_significant": alpha_significant,
                "r_squared":       r_squared,
                "resid_vol":       resid_vol,
                "betas":           betas,
                "t_stats":         tvals,
                "p_values":        pvals,
                "factor_contributions": factor_contribution,
                "total_factor_contribution": total_factor_contribution,
                "predicted_annual": predicted_annual,
            },
        )
