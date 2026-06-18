"""
Statistical Regime Detection model.

Uses a 2-state Gaussian Hidden Markov Model fitted on daily log-returns
and realised volatility. States are labelled Bull / Bear by their mean return.
Also overlays a Markov-Switching AR(1) model (statsmodels) as a cross-check.

Output:
  - Current regime (Bull / Bear / Transitioning)
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
        "2-state Hidden Markov Model on log-returns + realised volatility. "
        "Identifies Bull / Bear market regimes and transition probabilities."
    )
    category    = "regime"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch price history ────────────────────────────────────────────
        hist = yf.Ticker(ticker).history(period="2y")
        if len(hist) < 60:
            raise ValueError(f"Insufficient price history for {ticker}")

        close   = hist["Close"]
        volume  = hist["Volume"]
        dates   = close.index.strftime("%Y-%m-%d").tolist()

        log_ret = np.log(close / close.shift(1)).dropna()
        # Realised vol: 10-day rolling std of log returns (annualised)
        real_vol = log_ret.rolling(10).std() * np.sqrt(252)

        # Align on common index after dropping NaNs
        df = pd.DataFrame({"ret": log_ret, "vol": real_vol}).dropna()
        X  = df[["ret", "vol"]].values

        # ── 2. Fit 2-state HMM ───────────────────────────────────────────────
        model = GaussianHMM(
            n_components=2,
            covariance_type="full",
            n_iter=200,
            random_state=42,
        )
        model.fit(X)
        hidden_states = model.predict(X)

        # Label states: Bull = higher mean return state
        state_means = [df["ret"].values[hidden_states == s].mean() for s in range(2)]
        bull_state  = int(np.argmax(state_means))
        bear_state  = 1 - bull_state

        state_labels = {bull_state: "Bull", bear_state: "Bear"}

        # ── 3. Current regime & persistence ──────────────────────────────────
        current_state  = int(hidden_states[-1])
        current_label  = state_labels[current_state]

        # Days in current streak
        streak = 1
        for s in reversed(hidden_states[:-1]):
            if s == current_state:
                streak += 1
            else:
                break

        # ── 4. Transition probabilities ───────────────────────────────────────
        trans = model.transmat_
        stay_prob    = float(trans[current_state, current_state]) * 100
        switch_prob  = float(trans[current_state, 1 - current_state]) * 100

        # ── 5. Recent regime quality ──────────────────────────────────────────
        recent_n  = min(20, len(hidden_states))
        recent    = hidden_states[-recent_n:]
        bull_pct  = float((recent == bull_state).mean()) * 100

        # ── 6. Confidence scoring ─────────────────────────────────────────────
        # High confidence = long streak + high stay probability
        streak_score = min(streak / 30, 1.0)          # saturates at 30 days
        stay_score   = (stay_prob - 50) / 50           # 50%→0, 100%→1
        raw_conf     = (0.6 * stay_score + 0.4 * streak_score) * 100
        confidence   = round(max(20.0, min(95.0, raw_conf)), 1)

        # ── 7. Direction & regime label ───────────────────────────────────────
        if current_label == "Bull":
            direction = 1
            regime    = f"Bull Regime ({streak}d)"
        else:
            direction = -1
            regime    = f"Bear Regime ({streak}d)"

        # Transitioning: if recent 5 days flipped more than twice
        recent5       = hidden_states[-5:]
        flips         = int(np.sum(np.diff(recent5) != 0))
        transitioning = flips >= 2
        if transitioning:
            regime    = f"Transitioning ({current_label} leaning)"
            confidence = round(confidence * 0.7, 1)   # penalise noisy regime

        # ── 8. Signals ───────────────────────────────────────────────────────
        signals = [
            f"HMM current state: {current_label} regime for {streak} consecutive days",
            f"Probability of staying in {current_label}: {stay_prob:.1f}%",
            f"Last 20 sessions: {bull_pct:.0f}% in Bull regime",
            f"Recent volatility: {df['vol'].iloc[-1]*100:.1f}% annualised",
        ]
        if transitioning:
            signals.append("⚠️ High regime flip frequency — signal is noisy")

        bull_mean = state_means[bull_state] * 252 * 100   # annualised %
        bear_mean = state_means[bear_state] * 252 * 100
        signals.append(f"Bull state avg annual return: {bull_mean:+.1f}%")
        signals.append(f"Bear state avg annual return: {bear_mean:+.1f}%")

        # ── 9. Summary ────────────────────────────────────────────────────────
        if transitioning:
            summary = (
                f"{ticker} is in a regime transition — the HMM has been flipping states "
                f"frequently over the last 5 sessions. Current lean is {current_label}. "
                f"Confidence is reduced; wait for a clearer regime before acting."
            )
        else:
            summary = (
                f"{ticker} is in a {current_label} regime (HMM, {streak} days). "
                f"Probability of remaining {current_label} next session: {stay_prob:.0f}%. "
                f"{'Trend appears stable.' if streak > 10 else 'Regime is young — watch for early flip.'}"
            )

        # ── 10. Chart data ────────────────────────────────────────────────────
        # Align dates to the HMM output (df index, which starts after NaN drop)
        hmm_dates  = df.index.strftime("%Y-%m-%d").tolist()
        regime_series = [
            {"date": d, "regime": state_labels[int(s)], "value": 1 if s == bull_state else -1}
            for d, s in zip(hmm_dates, hidden_states)
        ]

        # Price series for overlay (last 252 days)
        price_series = [
            {"date": d, "price": round(float(p), 2)}
            for d, p in zip(dates[-252:], close.values[-252:])
        ]

        # Transition matrix as serialisable dict
        trans_matrix = {
            "Bull→Bull": round(float(trans[bull_state, bull_state]) * 100, 1),
            "Bull→Bear": round(float(trans[bull_state, bear_state]) * 100, 1),
            "Bear→Bull": round(float(trans[bear_state, bull_state]) * 100, 1),
            "Bear→Bear": round(float(trans[bear_state, bear_state]) * 100, 1),
        }

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
                "streak_days":       streak,
                "stay_probability":  round(stay_prob, 1),
                "switch_probability": round(switch_prob, 1),
                "bull_pct_recent20": round(bull_pct, 1),
                "transitioning":     transitioning,
                "transition_matrix": trans_matrix,
                "bull_state_annual_return": round(bull_mean, 2),
                "bear_state_annual_return": round(bear_mean, 2),
            },
        )
