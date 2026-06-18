"""
Ensemble / Meta-Signal model.

Runs all five core quant models (regime, mean reversion, momentum,
volatility, factor) and computes a weighted consensus signal.

Each model contributes: direction × (confidence/100) → score in [-1, +1]
Weights reflect how forward-looking each model is:
  Regime Detection   25%  — broad market state, persistent
  Momentum           25%  — price-action trend, most actionable
  Mean Reversion     15%  — counter-trend, works best in range
  Volatility Regime  15%  — risk filter, not directly directional
  Factor Model       20%  — fundamental risk factor tilt

Direction:
  Bullish ( 1) — weighted composite > +0.15
  Bearish (-1) — weighted composite < -0.15
  Neutral ( 0) — mixed signals

Confidence = abs(composite) × 100, capped by agreement score.
"""
import logging
import warnings

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

MODEL_WEIGHTS = {
    "regime_detection": 0.25,
    "momentum":         0.25,
    "factor_model":     0.20,
    "mean_reversion":   0.15,
    "volatility_regime": 0.15,
}


class EnsembleModel(QuantModel):
    id          = "ensemble"
    name        = "Ensemble / Meta-Signal"
    description = (
        "Weighted consensus of all 5 core quant models. "
        "Each model votes direction × confidence; weights are regime 25%, "
        "momentum 25%, factor 20%, mean reversion 15%, volatility 15%."
    )
    category    = "ensemble"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Import all component models ───────────────────────────────────
        from features.quant.models.regime       import RegimeDetectionModel
        from features.quant.models.momentum     import MomentumModel
        from features.quant.models.mean_reversion import MeanReversionModel
        from features.quant.models.volatility   import VolatilityRegimeModel
        from features.quant.models.factor       import FactorModel

        component_classes = {
            "regime_detection": RegimeDetectionModel,
            "momentum":         MomentumModel,
            "mean_reversion":   MeanReversionModel,
            "volatility_regime": VolatilityRegimeModel,
            "factor_model":     FactorModel,
        }

        # ── 2. Run each model, collect results ────────────────────────────────
        component_results = []
        errors = []
        for mid, cls in component_classes.items():
            try:
                res = cls().analyze(ticker)
                component_results.append({
                    "model_id":   mid,
                    "model_name": res.model_name,
                    "direction":  res.direction,
                    "confidence": res.confidence,
                    "regime":     res.regime,
                    "score":      res.direction * (res.confidence / 100),
                    "weight":     MODEL_WEIGHTS[mid],
                })
            except Exception as e:
                logger.warning(f"Ensemble: {mid} failed for {ticker}: {e}")
                errors.append(f"{mid}: {str(e)[:60]}")

        if not component_results:
            raise ValueError(f"All component models failed for {ticker}: {'; '.join(errors)}")

        # ── 3. Weighted composite score ───────────────────────────────────────
        # Normalise weights across models that succeeded
        total_weight  = sum(r["weight"] for r in component_results)
        weighted_score = sum(r["score"] * r["weight"] / total_weight
                            for r in component_results)

        # Agreement: how many models agree on the direction?
        bull_ct   = sum(1 for r in component_results if r["direction"] == 1)
        bear_ct   = sum(1 for r in component_results if r["direction"] == -1)
        neut_ct   = sum(1 for r in component_results if r["direction"] == 0)
        n_models  = len(component_results)
        dominant  = max(bull_ct, bear_ct, neut_ct)
        agreement = dominant / n_models   # 1.0 = unanimous

        # ── 4. Direction ──────────────────────────────────────────────────────
        if weighted_score > 0.15:
            direction = 1
        elif weighted_score < -0.15:
            direction = -1
        else:
            direction = 0

        # ── 5. Confidence ─────────────────────────────────────────────────────
        magnitude_conf = min(abs(weighted_score) / 0.6, 1.0) * 60   # up to 60
        agreement_conf = (agreement - 0.4) / 0.6 * 30               # up to 30 when unanimous
        confidence     = round(max(15.0, min(92.0, magnitude_conf + agreement_conf + 10)), 1)
        if direction == 0:
            confidence = min(confidence, 45.0)

        # ── 6. Regime label ───────────────────────────────────────────────────
        agree_str = f"{dominant}/{n_models} models agree"
        if direction == 1:
            regime = f"Consensus Bullish ({agree_str})"
        elif direction == -1:
            regime = f"Consensus Bearish ({agree_str})"
        else:
            regime = f"No Consensus ({agree_str})"

        # ── 7. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Weighted composite score: {weighted_score:+.3f} (range: -1 to +1)",
            f"Model agreement: {dominant}/{n_models} — {bull_ct} bullish, {neut_ct} neutral, {bear_ct} bearish",
        ]
        for r in sorted(component_results, key=lambda x: abs(x["score"]), reverse=True):
            dir_str = "BULL" if r["direction"] == 1 else "BEAR" if r["direction"] == -1 else "NEUT"
            signals.append(
                f"{r['model_name']}: {dir_str} ({r['confidence']:.0f}% conf) "
                f"— score {r['score']:+.2f} × weight {r['weight']*100:.0f}% "
                f"[{r['regime']}]"
            )
        if errors:
            signals.append(f"⚠️ Model errors: {'; '.join(errors)}")

        # ── 8. Summary ────────────────────────────────────────────────────────
        dominant_models = [r["model_name"] for r in component_results
                           if r["direction"] == direction and direction != 0][:2]
        dissenting      = [r["model_name"] for r in component_results
                           if r["direction"] not in (direction, 0)][:1]

        if direction == 1:
            summary = (
                f"{ticker} ensemble is bullish (weighted score {weighted_score:+.2f}). "
                f"{dominant}/{n_models} models agree. "
                f"Led by: {', '.join(dominant_models) or 'n/a'}."
                + (f" Dissent: {dissenting[0]}." if dissenting else "")
            )
        elif direction == -1:
            summary = (
                f"{ticker} ensemble is bearish (weighted score {weighted_score:+.2f}). "
                f"{dominant}/{n_models} models agree. "
                f"Led by: {', '.join(dominant_models) or 'n/a'}."
                + (f" Dissent: {dissenting[0]}." if dissenting else "")
            )
        else:
            summary = (
                f"{ticker} has no consensus signal (weighted score {weighted_score:+.2f}). "
                f"{bull_ct} models bullish, {neut_ct} neutral, {bear_ct} bearish — "
                f"mixed environment; higher-timeframe clarity needed."
            )

        # ── 9. Chart data — vote bar ──────────────────────────────────────────
        vote_bars = [
            {
                "model":      r["model_name"],
                "direction":  r["direction"],
                "confidence": r["confidence"],
                "score":      round(r["score"], 3),
                "weight":     r["weight"],
                "weighted":   round(r["score"] * r["weight"] / total_weight, 3),
            }
            for r in component_results
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
            chart_data = {"vote_bars": vote_bars},
            meta = {
                "weighted_score":  round(weighted_score, 4),
                "agreement":       round(agreement, 3),
                "bull_count":      bull_ct,
                "neutral_count":   neut_ct,
                "bear_count":      bear_ct,
                "models_run":      n_models,
                "errors":          errors,
                "component_scores": {r["model_id"]: round(r["score"], 3) for r in component_results},
            },
        )
