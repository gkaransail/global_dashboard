"""
Statistical Regime Detection model.

Uses a 3-state Gaussian Hidden Markov Model fitted on daily log-returns
and realised volatility. States are labelled Bull / Bear / Sideways.

Labelling by mean return:
  Bull     = highest mean return state
  Bear     = lowest mean return state
  Sideways = middle state (low return, low vol — choppy/range-bound)

Output:
  - Current regime (Bull / Bear / Sideways / Transitioning)
  - Regime history for charting (last 252 trading days)
  - Transition probabilities
  - Regime persistence (days in current state)
  - Recommendation with confidence
"""
import logging
import warnings
import numpy as np
import pandas as pd
import yfinance as yf
from hmmlearn.hmm import GaussianHMM

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


class RegimeDetectionModel(QuantModel):
    id          = "regime_detection"
    name        = "Statistical Regime Detection"
    description = (
        "3-state Hidden Markov Model on log-returns + realised volatility. "
        "Identifies Bull / Bear / Sideways market regimes and transition probabilities."
    )
    category    = "regime"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch price history ────────────────────────────────────────────
        hist = yf.Ticker(ticker).history(period="2y")
        if len(hist) < 60:
            raise ValueError(f"Insufficient price history for {ticker}")

        close   = hist["Close"]
        dates   = close.index.strftime("%Y-%m-%d").tolist()

        log_ret = np.log(close / close.shift(1)).dropna()
        real_vol = log_ret.rolling(10).std() * np.sqrt(252)

        df = pd.DataFrame({"ret": log_ret, "vol": real_vol}).dropna()
        X  = df[["ret", "vol"]].values

        # ── 2. Fit 3-state HMM ───────────────────────────────────────────────
        model = GaussianHMM(
            n_components=3,
            covariance_type="full",
            n_iter=300,
            random_state=42,
        )
        model.fit(X)
        hidden_states = model.predict(X)

        # Label states by mean return (sorted ascending: Bear < Sideways < Bull)
        state_means = np.array([
            df["ret"].values[hidden_states == s].mean() for s in range(3)
        ])
        state_vols = np.array([
            df["vol"].values[hidden_states == s].mean() for s in range(3)
        ])

        sorted_by_return = np.argsort(state_means)   # [bear_idx, sideways_idx, bull_idx]
        bear_state    = int(sorted_by_return[0])
        sideways_state = int(sorted_by_return[1])
        bull_state    = int(sorted_by_return[2])

        state_labels = {
            bull_state:     "Bull",
            bear_state:     "Bear",
            sideways_state: "Sideways",
        }

        # ── 3. Current regime & persistence ──────────────────────────────────
        current_state  = int(hidden_states[-1])
        current_label  = state_labels[current_state]

        streak = 1
        for s in reversed(hidden_states[:-1]):
            if s == current_state:
                streak += 1
            else:
                break

        # ── 4. Transition probabilities ───────────────────────────────────────
        trans      = model.transmat_
        stay_prob  = float(trans[current_state, current_state]) * 100

        # ── 5. Recent regime distribution (last 20 sessions) ─────────────────
        recent_n   = min(20, len(hidden_states))
        recent     = hidden_states[-recent_n:]
        bull_pct   = float((recent == bull_state).mean()) * 100
        bear_pct   = float((recent == bear_state).mean()) * 100
        side_pct   = float((recent == sideways_state).mean()) * 100

        # ── 6. Confidence scoring ─────────────────────────────────────────────
        streak_score = min(streak / 30, 1.0)
        stay_score   = (stay_prob - 50) / 50
        raw_conf     = (0.6 * stay_score + 0.4 * streak_score) * 100
        confidence   = round(max(20.0, min(95.0, raw_conf)), 1)

        # ── 7. Direction & regime label ───────────────────────────────────────
        if current_label == "Bull":
            direction = 1
            regime    = f"Bull Regime ({streak}d)"
        elif current_label == "Bear":
            direction = -1
            regime    = f"Bear Regime ({streak}d)"
        else:
            direction = 0
            regime    = f"Sideways/Choppy ({streak}d)"

        # Transitioning: if recent 5 days have ≥2 state flips
        recent5       = hidden_states[-5:]
        flips         = int(np.sum(np.diff(recent5) != 0))
        transitioning = flips >= 2
        if transitioning:
            regime    = f"Transitioning ({current_label} leaning)"
            confidence = round(confidence * 0.7, 1)

        # ── 8. Signals ───────────────────────────────────────────────────────
        bull_mean    = state_means[bull_state] * 252 * 100
        bear_mean    = state_means[bear_state] * 252 * 100
        side_mean    = state_means[sideways_state] * 252 * 100
        current_vol  = df["vol"].iloc[-1] * 100

        signals = [
            f"HMM current state: {current_label} regime for {streak} consecutive days",
            f"Probability of staying in {current_label}: {stay_prob:.1f}%",
            f"Last 20 sessions: Bull {bull_pct:.0f}% / Sideways {side_pct:.0f}% / Bear {bear_pct:.0f}%",
            f"Current realized vol: {current_vol:.1f}% annualised",
            f"Bull state avg return: {bull_mean:+.1f}% p.a.  |  Sideways: {side_mean:+.1f}%  |  Bear: {bear_mean:+.1f}%",
        ]
        if transitioning:
            signals.append("⚠️ High regime flip frequency — signal is noisy, wait for regime clarity")

        # ── 9. Summary ────────────────────────────────────────────────────────
        if transitioning:
            summary = (
                f"{ticker} is in a regime transition — the HMM has been flipping states "
                f"frequently over the last 5 sessions. Current lean is {current_label}. "
                f"Confidence is reduced; wait for a clearer regime before acting."
            )
        elif current_label == "Sideways":
            summary = (
                f"{ticker} is in a Sideways/Choppy regime (HMM, {streak} days). "
                f"The model identifies range-bound, low-return conditions — "
                f"mean reversion strategies may outperform trend-following here. "
                f"Stay probability: {stay_prob:.0f}%."
            )
        else:
            summary = (
                f"{ticker} is in a {current_label} regime (HMM, {streak} days). "
                f"Probability of remaining {current_label} next session: {stay_prob:.0f}%. "
                f"{'Trend appears stable.' if streak > 10 else 'Regime is young — watch for early flip.'}"
            )

        # ── 10. Chart data ────────────────────────────────────────────────────
        hmm_dates  = df.index.strftime("%Y-%m-%d").tolist()
        val_map    = {"Bull": 1, "Sideways": 0, "Bear": -1}
        regime_series = [
            {"date": d, "regime": state_labels[int(s)], "value": val_map[state_labels[int(s)]]}
            for d, s in zip(hmm_dates, hidden_states)
        ]

        price_series = [
            {"date": d, "price": round(float(p), 2)}
            for d, p in zip(dates[-252:], close.values[-252:])
        ]

        # Full 3×3 transition matrix
        trans_matrix = {}
        for from_lbl, from_idx in [("Bull", bull_state), ("Sideways", sideways_state), ("Bear", bear_state)]:
            for to_lbl, to_idx in [("Bull", bull_state), ("Sideways", sideways_state), ("Bear", bear_state)]:
                trans_matrix[f"{from_lbl}→{to_lbl}"] = round(float(trans[from_idx, to_idx]) * 100, 1)

        return QuantResult(
            ticker      = ticker.upper(),
            model_id    = self.id,
            model_name  = self.name,
            direction   = direction,
            confidence  = confidence,
            regime      = regime,
            summary     = summary,
            signals     = signals,
            chart_data  = {
                "regime_series": regime_series[-252:],
                "price_series":  price_series,
            },
            meta = {
                "streak_days":        streak,
                "stay_probability":   round(stay_prob, 1),
                "bull_pct_recent20":  round(bull_pct, 1),
                "side_pct_recent20":  round(side_pct, 1),
                "bear_pct_recent20":  round(bear_pct, 1),
                "transitioning":      transitioning,
                "transition_matrix":  trans_matrix,
                "bull_state_annual_return":     round(float(bull_mean), 2),
                "sideways_state_annual_return": round(float(side_mean), 2),
                "bear_state_annual_return":     round(float(bear_mean), 2),
            },
        )
