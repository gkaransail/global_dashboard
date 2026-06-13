from typing import List, Dict, Optional, Any
from datetime import datetime
import numpy as np

from features.reversal.models import (
    IndividualSignal, ReversalSignal, SignalDirection, SignalStrength
)
from features.reversal.signals.macro import MacroSignalAnalyzer
from features.reversal.signals.technical import TechnicalSignalAnalyzer
from features.reversal.signals.breadth import BreadthSignalAnalyzer
from features.reversal.signals.sentiment import SentimentSignalAnalyzer
from core.data.fetcher import fetch_ohlcv, fetch_macro_data, fetch_sector_data
import pandas as pd

# Category weights for final confidence score
CATEGORY_WEIGHTS = {
    "macro": 0.30,
    "technical": 0.35,
    "breadth": 0.20,
    "sentiment": 0.15,
}

ANALYZERS = [
    MacroSignalAnalyzer(),
    TechnicalSignalAnalyzer(),
    BreadthSignalAnalyzer(),
    SentimentSignalAnalyzer(),
]


def _direction_score(signal: IndividualSignal) -> float:
    """Convert direction to +1 (bullish), -1 (bearish), 0 (neutral) weighted by strength."""
    if signal.direction == SignalDirection.BULLISH_REVERSAL:
        return signal.strength
    elif signal.direction == SignalDirection.BEARISH_REVERSAL:
        return -signal.strength
    return 0.0


def analyze_ticker(
    ticker: str,
    explain: bool = False,
    categories: Optional[List[str]] = None,
    lookback_days: int = 90,
) -> ReversalSignal:
    period = "6mo" if lookback_days > 90 else "3mo"
    df = fetch_ohlcv(ticker.upper(), period=period)
    macro_data = fetch_macro_data(period=period)
    sector_data = fetch_sector_data(period=period)

    all_signals: List[IndividualSignal] = []
    shared_kwargs = {"macro_data": macro_data, "sector_data": sector_data}

    for analyzer in ANALYZERS:
        if categories and analyzer.category not in categories:
            continue
        try:
            sigs = analyzer.analyze(ticker.upper(), df, **shared_kwargs)
            all_signals.extend(sigs)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Analyzer {analyzer.category} failed for {ticker}: {e}")

    # Aggregate by category with weighted scoring
    category_scores: Dict[str, float] = {}
    signal_counts: Dict[str, int] = {}

    for cat in CATEGORY_WEIGHTS:
        cat_signals = [s for s in all_signals if s.category == cat]
        if not cat_signals:
            category_scores[cat] = 0.0
            signal_counts[cat] = 0
            continue

        score = np.mean([_direction_score(s) for s in cat_signals])
        category_scores[cat] = float(score)
        signal_counts[cat] = len(cat_signals)

    # Weighted composite score: -1 to +1
    active_weights = {cat: w for cat, w in CATEGORY_WEIGHTS.items() if cat in category_scores}
    total_weight = sum(active_weights.values())

    if total_weight == 0:
        composite_score = 0.0
    else:
        composite_score = sum(
            category_scores[cat] * w / total_weight
            for cat, w in active_weights.items()
        )

    # Determine direction and confidence
    confidence = abs(composite_score)
    if composite_score > 0.08:
        direction = SignalDirection.BULLISH_REVERSAL
    elif composite_score < -0.08:
        direction = SignalDirection.BEARISH_REVERSAL
    else:
        direction = SignalDirection.NEUTRAL
        confidence = max(0.0, confidence)

    if confidence >= 0.70:
        strength = SignalStrength.STRONG
    elif confidence >= 0.45:
        strength = SignalStrength.MODERATE
    else:
        strength = SignalStrength.WEAK

    # Per-direction signal counts for dashboard
    bullish_count = sum(1 for s in all_signals if s.direction == SignalDirection.BULLISH_REVERSAL)
    bearish_count = sum(1 for s in all_signals if s.direction == SignalDirection.BEARISH_REVERSAL)
    neutral_count = sum(1 for s in all_signals if s.direction == SignalDirection.NEUTRAL)

    methodology_breakdown = {
        cat: {
            "score": round(category_scores.get(cat, 0.0), 3),
            "weight": CATEGORY_WEIGHTS.get(cat, 0),
            "signal_count": signal_counts.get(cat, 0),
        }
        for cat in CATEGORY_WEIGHTS
    }

    explanation = None
    if explain:
        explanation = _generate_explanation(
            ticker, direction, confidence, strength,
            all_signals, category_scores, composite_score
        )

    return ReversalSignal(
        ticker=ticker.upper(),
        timestamp=datetime.utcnow(),
        direction=direction,
        confidence=round(confidence, 3),
        strength=strength,
        signals=all_signals,
        signal_counts={
            "bullish": bullish_count,
            "bearish": bearish_count,
            "neutral": neutral_count,
            "total": len(all_signals),
        },
        explanation=explanation,
        methodology_breakdown=methodology_breakdown,
    )


def _generate_explanation(
    ticker: str,
    direction: SignalDirection,
    confidence: float,
    strength: SignalStrength,
    signals: List[IndividualSignal],
    category_scores: Dict[str, float],
    composite_score: float,
) -> str:
    direction_label = {
        SignalDirection.BULLISH_REVERSAL: "BULLISH REVERSAL",
        SignalDirection.BEARISH_REVERSAL: "BEARISH REVERSAL",
        SignalDirection.NEUTRAL: "NEUTRAL / NO CLEAR REVERSAL",
    }[direction]

    lines = [
        f"## {ticker} — {direction_label} Signal ({strength.value.upper()}, {confidence*100:.0f}% confidence)",
        "",
        f"**Overall Assessment:** Our multi-factor analysis of {ticker} generates a composite score of {composite_score:+.3f} "
        f"(range: -1.0 bearish to +1.0 bullish), indicating a **{direction_label}** setup with "
        f"**{strength.value}** conviction at **{confidence*100:.0f}%** confidence.",
        "",
    ]

    # Category breakdown
    lines.append("### Methodology Breakdown")
    for cat, score in sorted(category_scores.items(), key=lambda x: abs(x[1]), reverse=True):
        weight = CATEGORY_WEIGHTS.get(cat, 0)
        cat_signals = [s for s in signals if s.category == cat]
        cat_direction = "→ Bullish" if score > 0.05 else ("→ Bearish" if score < -0.05 else "→ Neutral")
        lines.append(f"- **{cat.title()}** ({weight*100:.0f}% weight): score {score:+.2f} {cat_direction} — {len(cat_signals)} signal(s) detected")

    lines.append("")
    lines.append("### Key Signals Driving This Call")

    # Top signals by strength, grouped by direction
    bullish_sigs = sorted(
        [s for s in signals if s.direction == SignalDirection.BULLISH_REVERSAL],
        key=lambda x: x.strength, reverse=True
    )[:4]
    bearish_sigs = sorted(
        [s for s in signals if s.direction == SignalDirection.BEARISH_REVERSAL],
        key=lambda x: x.strength, reverse=True
    )[:4]

    if bullish_sigs:
        lines.append("\n**Bullish Factors:**")
        for s in bullish_sigs:
            val_str = f" (value: {s.value})" if s.value is not None else ""
            lines.append(f"- [{s.category.upper()}] **{s.name}**{val_str}: {s.explanation or ''}")

    if bearish_sigs:
        lines.append("\n**Bearish Factors:**")
        for s in bearish_sigs:
            val_str = f" (value: {s.value})" if s.value is not None else ""
            lines.append(f"- [{s.category.upper()}] **{s.name}**{val_str}: {s.explanation or ''}")

    # Risk statement
    lines.append("")
    lines.append("### Risk Disclaimer")
    lines.append(
        "_This analysis is generated algorithmically from publicly available market data. "
        "It is for informational purposes only and does not constitute financial advice. "
        "Past signal performance does not guarantee future results. Always conduct your own due diligence._"
    )

    return "\n".join(lines)
