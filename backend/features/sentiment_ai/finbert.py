"""
FinBERT sentiment engine.

Model: ProsusAI/finbert — BERT fine-tuned on financial text.
Labels: positive | negative | neutral

The pipeline is loaded once on first use and cached in process memory.
Subsequent calls are fast (CPU inference ~50ms per batch).
"""
import logging
import math
from typing import Optional
from core import cache as _cache

logger = logging.getLogger(__name__)

_pipeline = None  # module-level singleton


def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    try:
        from transformers import pipeline
        logger.info("Loading FinBERT model (ProsusAI/finbert)…")
        _pipeline = pipeline(
            "text-classification",
            model="ProsusAI/finbert",
            tokenizer="ProsusAI/finbert",
            top_k=None,          # return all 3 label scores
            truncation=True,
            max_length=512,
        )
        logger.info("FinBERT loaded successfully.")
        return _pipeline
    except Exception as e:
        logger.error(f"FinBERT load failed: {e}")
        return None


def score_text(text: str) -> dict:
    """
    Score a single piece of text.
    Returns: {positive, negative, neutral, label, score, compound}
    """
    pipe = _get_pipeline()
    if pipe is None:
        return _fallback(text)

    try:
        results = pipe(text[:512])  # FinBERT max 512 tokens
        # results is a list of lists when top_k=None
        scores_list = results[0] if isinstance(results[0], list) else results

        scores = {r["label"].lower(): r["score"] for r in scores_list}
        pos = scores.get("positive", 0.0)
        neg = scores.get("negative", 0.0)
        neu = scores.get("neutral",  0.0)

        # Compound score: -1 (extreme negative) → +1 (extreme positive)
        compound = round(pos - neg, 4)

        label = max(scores, key=scores.get)

        return {
            "positive":  round(pos, 4),
            "negative":  round(neg, 4),
            "neutral":   round(neu, 4),
            "label":     label,
            "score":     round(scores[label], 4),
            "compound":  compound,
        }
    except Exception as e:
        logger.warning(f"FinBERT inference failed: {e}")
        return _fallback(text)


def score_batch(texts: list[str]) -> list[dict]:
    """Score multiple texts in one forward pass (faster than looping score_text)."""
    pipe = _get_pipeline()
    if pipe is None:
        return [_fallback(t) for t in texts]

    try:
        # Truncate each text to 512 chars (tokeniser handles token count)
        truncated = [t[:512] for t in texts]
        results = pipe(truncated)

        output = []
        for result in results:
            scores_list = result if isinstance(result, list) else [result]
            scores = {r["label"].lower(): r["score"] for r in scores_list}
            pos = scores.get("positive", 0.0)
            neg = scores.get("negative", 0.0)
            neu = scores.get("neutral",  0.0)
            compound = round(pos - neg, 4)
            label = max(scores, key=scores.get)
            output.append({
                "positive": round(pos, 4),
                "negative": round(neg, 4),
                "neutral":  round(neu, 4),
                "label":    label,
                "score":    round(scores[label], 4),
                "compound": compound,
            })
        return output
    except Exception as e:
        logger.warning(f"FinBERT batch inference failed: {e}")
        return [_fallback(t) for t in texts]


def analyze_news_articles(articles: list[dict]) -> dict:
    """
    Score a list of news article dicts (each needs a 'title' and optionally 'summary').
    Returns per-article scores + aggregate sentiment stats.
    """
    if not articles:
        return {"articles": [], "aggregate": _empty_aggregate()}

    texts = []
    for a in articles:
        # Use title + summary for richer context
        title   = a.get("title", "")
        summary = a.get("summary", "")
        text = f"{title}. {summary}".strip() if summary else title
        texts.append(text)

    scores = score_batch(texts)

    enriched = []
    for article, sentiment in zip(articles, scores):
        enriched.append({**article, "sentiment": sentiment})

    # Aggregate
    compounds = [s["compound"] for s in scores]
    pos_count = sum(1 for s in scores if s["label"] == "positive")
    neg_count = sum(1 for s in scores if s["label"] == "negative")
    neu_count = sum(1 for s in scores if s["label"] == "neutral")
    avg_compound = round(sum(compounds) / len(compounds), 4) if compounds else 0.0

    # Weighted aggregate: positive articles pull score up, negative pull down
    if avg_compound > 0.15:
        aggregate_label = "Bullish"
    elif avg_compound > 0.05:
        aggregate_label = "Mildly Bullish"
    elif avg_compound < -0.15:
        aggregate_label = "Bearish"
    elif avg_compound < -0.05:
        aggregate_label = "Mildly Bearish"
    else:
        aggregate_label = "Neutral"

    return {
        "articles": enriched,
        "aggregate": {
            "label":          aggregate_label,
            "avg_compound":   avg_compound,
            "positive_count": pos_count,
            "negative_count": neg_count,
            "neutral_count":  neu_count,
            "total":          len(articles),
            "bull_pct":       round(pos_count / len(articles) * 100, 1),
            "bear_pct":       round(neg_count / len(articles) * 100, 1),
        },
    }


def _fallback(text: str) -> dict:
    """Return neutral scores when FinBERT is unavailable."""
    return {"positive": 0.33, "negative": 0.33, "neutral": 0.34,
            "label": "neutral", "score": 0.34, "compound": 0.0}


def _empty_aggregate() -> dict:
    return {"label": "Neutral", "avg_compound": 0.0,
            "positive_count": 0, "negative_count": 0, "neutral_count": 0,
            "total": 0, "bull_pct": 0.0, "bear_pct": 0.0}
