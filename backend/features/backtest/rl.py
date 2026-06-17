"""
Reinforcement learning weight optimizer — contextual bandit.

Each signal is treated as a feature in a linear policy:
    score = Σ weight[i] × signal_value[i]
    direction = sign(score)

After each evaluated prediction we update weights via:
    Reward R = actual_return_pct × direction  (positive = correct)
    Δweight[i] = lr × R × signal_contribution[i]

Over time, signals that reliably predict direction get higher weights;
unreliable signals trend toward zero.

Weights are clamped to [0.1, 5.0] so no signal ever fully disappears.
"""
import logging
from features.backtest import db

logger = logging.getLogger(__name__)

LEARNING_RATE = 0.05
WEIGHT_MIN    = 0.1
WEIGHT_MAX    = 5.0


def _signal_contributions(pred: dict) -> dict[str, float]:
    """
    Map a prediction record to the signed contribution each signal made.
    Positive = pushed toward bullish, negative = pushed toward bearish.
    Magnitude matches the base contribution in the scorer.
    """
    c: dict[str, float] = {}

    pc = pred.get("pc_atm_ratio") or pred.get("pc_vol_ratio") or pred.get("pc_ratio")
    if pc is not None:
        if pc < 0.6:    c["atm_pc_bull"] = +3.0
        elif pc < 0.8:  c["atm_pc_bull"] = +2.0
        elif pc < 1.0:  c["atm_pc_bull"] = +1.0
        elif pc < 1.2:  c["atm_pc_bear"] = -1.0
        elif pc < 1.5:  c["atm_pc_bear"] = -2.0
        else:            c["atm_pc_bear"] = -3.0

    mp_pct = pred.get("max_pain_pct")
    if mp_pct is not None:
        if mp_pct > 2:   c["max_pain_above"] = +1.0
        elif mp_pct < -2: c["max_pain_below"] = -1.0

    iv_rank = pred.get("iv_rank")
    if iv_rank is not None:
        if iv_rank > 70:   c["iv_rank_fear"] = -1.0
        elif iv_rank < 25: c["iv_rank_calm"] = +1.0

    if pred.get("squeeze_candidate"):
        c["squeeze"] = +1.0

    gex = pred.get("gex_environment")
    if gex == "positive":  c["gex_positive"] = +0.5
    elif gex == "negative": c["gex_negative"] = -0.5

    sig = pred.get("options_flow_significance")
    if sig == "Extreme":
        # Amplifies whichever direction the other signals point
        direction = pred.get("direction", 0)
        if direction != 0:
            c["activity_extreme"] = 0.5 * direction

    return c


def run_rl_update() -> dict:
    """
    Process all unapplied evaluated predictions and update signal weights.
    Returns a summary of changes.
    """
    db.init_db()
    evaluated   = db.get_all_evaluated()
    weights     = db.get_signal_weights()
    changes: dict[str, dict] = {}

    # Per-signal running tallies
    signal_correct: dict[str, int] = {k: 0 for k in weights}
    signal_total:   dict[str, int] = {k: 0 for k in weights}

    for pred in evaluated:
        direction   = pred.get("direction", 0)
        return_pct  = pred.get("actual_return_pct")
        if direction == 0 or return_pct is None:
            continue

        # Reward: positive when prediction was correct, negative when wrong
        reward = return_pct * direction  # +ve if bull+up or bear+down

        contribs = _signal_contributions(pred)
        for sig_name, contribution in contribs.items():
            if sig_name not in weights:
                continue
            old_w = weights[sig_name]["weight"]

            # Gradient step: contribution was in the same direction as prediction
            # If reward > 0 (correct): reinforce. If reward < 0 (wrong): penalise.
            delta = LEARNING_RATE * reward * abs(contribution) / 3.0  # normalize by max contribution
            new_w = max(WEIGHT_MIN, min(WEIGHT_MAX, old_w + delta))
            weights[sig_name]["weight"] = new_w

            # Track accuracy
            correct_call = 1 if reward > 0 else 0
            signal_correct[sig_name] = signal_correct.get(sig_name, 0) + correct_call
            signal_total[sig_name]   = signal_total.get(sig_name, 0) + 1

    # Persist updated weights
    for sig_name, w in weights.items():
        total   = signal_total.get(sig_name, 0)
        correct = signal_correct.get(sig_name, 0)
        acc     = round(correct / total, 3) if total > 0 else w.get("accuracy")
        new_weight = round(w["weight"], 3)
        db.update_signal_weight(sig_name, new_weight, acc, total)
        old = w.get("weight", w.get("base_weight", 1.0))
        if abs(new_weight - old) > 0.01:
            changes[sig_name] = {"old": round(old, 3), "new": new_weight, "accuracy": acc, "samples": total}

    return {
        "signals_updated": len(changes),
        "changes":         changes,
        "total_predictions_processed": len(evaluated),
    }


def get_weights_summary() -> list[dict]:
    """Return signal weights sorted by current weight descending."""
    db.init_db()
    weights = db.get_signal_weights()
    rows = []
    for name, w in weights.items():
        rows.append({
            "signal":       name,
            "weight":       round(w["weight"], 3),
            "base_weight":  round(w["base_weight"], 3),
            "accuracy":     w.get("accuracy"),
            "sample_count": w.get("sample_count", 0),
            "drift":        round(w["weight"] - w["base_weight"], 3),
        })
    return sorted(rows, key=lambda x: x["weight"], reverse=True)
