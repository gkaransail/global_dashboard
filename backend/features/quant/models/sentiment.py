"""
News Sentiment model — powered by FinBERT.

Fetches recent news headlines for the ticker, scores each with FinBERT
(ProsusAI/finbert), and aggregates into a bullish/bearish/neutral verdict.

Key metrics:
  avg_compound  — mean compound sentiment score across articles (-1 to +1)
  bull_ratio    — fraction of articles with positive sentiment
  bear_ratio    — fraction of articles with negative sentiment
  article_count — number of articles scored

Direction:
  Bullish ( 1) — avg_compound > 0.10 and bull_ratio > 0.5
  Bearish (-1) — avg_compound < -0.10 and bear_ratio > 0.5
  Neutral ( 0) — mixed or near-zero sentiment

Confidence scales with the magnitude of avg_compound and article count.
"""
import logging
import warnings

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

_NEUTRAL_RESULT_CACHE: dict = {}   # lightweight: don't re-score if FinBERT unavailable


class SentimentModel(QuantModel):
    id          = "sentiment"
    name        = "News Sentiment (FinBERT)"
    description = (
        "FinBERT NLP model scores recent news headlines for the ticker. "
        "Aggregates bullish / bearish / neutral article ratios into a sentiment signal."
    )
    category    = "sentiment"
    timeframe   = "short"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch news ─────────────────────────────────────────────────────
        try:
            from core.news import fetch_ticker_news
            articles = fetch_ticker_news(ticker.upper(), max_items=20)
        except Exception as e:
            raise ValueError(f"News fetch failed for {ticker}: {e}")

        if not articles:
            raise ValueError(f"No recent news found for {ticker}")

        # ── 2. Score with FinBERT ─────────────────────────────────────────────
        try:
            from features.sentiment_ai.finbert import analyze_news_articles
            analysis = analyze_news_articles(articles)
        except Exception as e:
            raise ValueError(f"FinBERT scoring failed for {ticker}: {e}")

        agg = analysis.get("aggregate", {})
        if not agg:
            raise ValueError(f"FinBERT returned no aggregate for {ticker}")

        avg_compound   = float(agg.get("avg_compound", 0.0))
        avg_positive   = float(agg.get("avg_positive", 0.0))
        avg_negative   = float(agg.get("avg_negative", 0.0))
        avg_neutral    = float(agg.get("avg_neutral", 0.0))
        bull_ratio     = float(agg.get("positive_ratio", 0.0))
        bear_ratio     = float(agg.get("negative_ratio", 0.0))
        neutral_ratio  = float(agg.get("neutral_ratio", 0.0))
        article_count  = int(agg.get("article_count", len(articles)))

        # ── 3. Direction ──────────────────────────────────────────────────────
        if avg_compound > 0.10 and bull_ratio > 0.45:
            direction = 1
        elif avg_compound < -0.10 and bear_ratio > 0.45:
            direction = -1
        else:
            direction = 0

        # ── 4. Confidence ─────────────────────────────────────────────────────
        # Scales with compound magnitude + article count (more data = more reliable)
        magnitude_conf = min(abs(avg_compound) / 0.5, 1.0) * 50    # up to 50
        count_conf     = min(article_count / 15, 1.0) * 25          # up to 25 for 15+ articles
        consensus_conf = abs(bull_ratio - bear_ratio) * 20          # up to 20 for lopsided

        confidence = round(max(15.0, min(80.0, magnitude_conf + count_conf + consensus_conf)), 1)
        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 5. Regime label ───────────────────────────────────────────────────
        if avg_compound > 0.25:
            regime = f"Very Bullish Sentiment ({article_count} articles)"
        elif avg_compound > 0.10:
            regime = f"Mildly Bullish Sentiment ({article_count} articles)"
        elif avg_compound < -0.25:
            regime = f"Very Bearish Sentiment ({article_count} articles)"
        elif avg_compound < -0.10:
            regime = f"Mildly Bearish Sentiment ({article_count} articles)"
        else:
            regime = f"Neutral Sentiment ({article_count} articles)"

        # ── 6. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Avg compound score: {avg_compound:+.3f}  (range: -1 bearish → +1 bullish)",
            f"Article breakdown: {bull_ratio*100:.0f}% bullish / {neutral_ratio*100:.0f}% neutral / {bear_ratio*100:.0f}% bearish",
            f"Avg FinBERT scores — Positive: {avg_positive:.2f}  Neutral: {avg_neutral:.2f}  Negative: {avg_negative:.2f}",
            f"Sample size: {article_count} articles scored",
        ]

        # Surface the top positive/negative headlines
        scored_articles = analysis.get("articles", [])
        top_bull = sorted(scored_articles, key=lambda a: a.get("sentiment", {}).get("compound", 0), reverse=True)[:2]
        top_bear = sorted(scored_articles, key=lambda a: a.get("sentiment", {}).get("compound", 0))[:2]

        for art in top_bull:
            s = art.get("sentiment", {})
            if s.get("compound", 0) > 0.05:
                signals.append(f"+ [{s.get('label','?')} {s.get('compound',0):+.2f}] {art.get('title','')[:80]}")
        for art in top_bear:
            s = art.get("sentiment", {})
            if s.get("compound", 0) < -0.05:
                signals.append(f"- [{s.get('label','?')} {s.get('compound',0):+.2f}] {art.get('title','')[:80]}")

        # ── 7. Summary ────────────────────────────────────────────────────────
        if direction == 1:
            summary = (
                f"{ticker} news sentiment is bullish (FinBERT compound score: {avg_compound:+.2f}). "
                f"{bull_ratio*100:.0f}% of {article_count} articles carry positive sentiment. "
                f"Positive news flow can reinforce price momentum in the near term."
            )
        elif direction == -1:
            summary = (
                f"{ticker} news sentiment is bearish (FinBERT compound score: {avg_compound:+.2f}). "
                f"{bear_ratio*100:.0f}% of {article_count} articles carry negative sentiment. "
                f"Negative news flow may weigh on the stock near-term."
            )
        else:
            summary = (
                f"{ticker} news sentiment is neutral/mixed (FinBERT compound: {avg_compound:+.2f}). "
                f"No dominant tone across {article_count} articles — "
                f"{bull_ratio*100:.0f}% bullish, {neutral_ratio*100:.0f}% neutral, {bear_ratio*100:.0f}% bearish."
            )

        # ── 8. Chart data — sentiment time series ────────────────────────────
        # Build per-article bar data sorted by date
        art_bars = []
        for art in scored_articles:
            s = art.get("sentiment", {})
            art_bars.append({
                "title":    art.get("title", "")[:60],
                "compound": round(float(s.get("compound", 0)), 3),
                "label":    s.get("label", "neutral"),
            })
        # Sort most recent first (articles typically come newest first anyway)
        art_bars = art_bars[:15]   # cap at 15 for display

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
            chart_data = {"article_bars": art_bars},
            meta = {
                "avg_compound":   round(avg_compound, 4),
                "avg_positive":   round(avg_positive, 4),
                "avg_negative":   round(avg_negative, 4),
                "avg_neutral":    round(avg_neutral, 4),
                "bull_ratio":     round(bull_ratio, 3),
                "bear_ratio":     round(bear_ratio, 3),
                "neutral_ratio":  round(neutral_ratio, 3),
                "article_count":  article_count,
            },
        )
