"""
Sentiment & positioning signal analyzer.

Sources (all free via yfinance or derived):
- Fear & Greed proxy: VIX + market momentum + safe haven demand
- Put/Call ratio proxy from VIX spread
- Short squeeze potential: price momentum vs high short interest tickers
- Smart money divergence: institutional accumulation pattern (Wyckoff-style volume)
- Insider activity proxy: not directly available without premium, uses price+volume pattern
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from features.reversal.signals.base import BaseSignalAnalyzer
from features.reversal.models import IndividualSignal, SignalDirection
from core.data.fetcher import MACRO_TICKERS, fetch_ohlcv


class SentimentSignalAnalyzer(BaseSignalAnalyzer):
    category = "sentiment"

    def analyze(self, ticker: str, df: pd.DataFrame, **kwargs) -> List[IndividualSignal]:
        macro_data = kwargs.get("macro_data") or {}
        signals: List[IndividualSignal] = []

        signals.extend(self._fear_greed_proxy(macro_data))
        signals.extend(self._smart_money_divergence(df))
        signals.extend(self._momentum_exhaustion(df))
        signals.extend(self._price_vs_news_gap(ticker, df))
        return signals

    def _fear_greed_proxy(self, macro_data: Dict) -> List[IndividualSignal]:
        """
        Composite Fear & Greed proxy using:
        - VIX level (fear)
        - Gold/S&P ratio (safe haven demand)
        - 20-day price momentum of S&P 500
        """
        vix_df = macro_data.get(MACRO_TICKERS["vix"])
        sp_df = macro_data.get(MACRO_TICKERS["sp500"])
        gold_df = macro_data.get(MACRO_TICKERS["gold"])

        if vix_df is None or sp_df is None:
            return []

        vix = float(vix_df["Close"].iloc[-1])

        # Score: 0 = extreme fear, 100 = extreme greed
        # VIX component (inverted): vix 10=100, vix 40=0
        vix_score = self._clamp((40 - vix) / 30) * 100

        # S&P momentum component
        sp_mom = 50.0
        if len(sp_df) >= 21:
            sp_ret = self._pct_change(sp_df["Close"], 20)
            sp_mom = self._clamp(sp_ret * 10 + 0.5) * 100

        # Gold/SP ratio component (inverted — high gold demand = fear)
        gold_score = 50.0
        if gold_df is not None and len(gold_df) >= 21 and len(sp_df) >= 21:
            gold_ret = self._pct_change(gold_df["Close"], 20)
            gold_score = self._clamp(-gold_ret * 10 + 0.5) * 100

        fg_score = (vix_score * 0.4 + sp_mom * 0.4 + gold_score * 0.2)

        results = []
        if fg_score < 25:
            results.append(IndividualSignal(
                name=f"Fear & Greed: Extreme Fear ({fg_score:.0f}/100)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp((25 - fg_score) / 25 + 0.5),
                value=round(fg_score, 1),
                explanation=f"Composite Fear & Greed score at {fg_score:.0f}/100 — extreme fear territory. Historically, extreme fear readings precede market bottoms and bullish reversals (contrarian signal).",
            ))
        elif fg_score > 80:
            results.append(IndividualSignal(
                name=f"Fear & Greed: Extreme Greed ({fg_score:.0f}/100)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=self._clamp((fg_score - 80) / 20 + 0.5),
                value=round(fg_score, 1),
                explanation=f"Composite Fear & Greed score at {fg_score:.0f}/100 — extreme greed. Markets historically correct after euphoric readings.",
            ))
        elif fg_score < 40:
            results.append(IndividualSignal(
                name=f"Fear & Greed: Fear ({fg_score:.0f}/100)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.45,
                value=round(fg_score, 1),
                explanation=f"Fear & Greed score at {fg_score:.0f}/100 — fearful sentiment; often a setup for eventual bullish reversal.",
            ))
        return results

    def _smart_money_divergence(self, df: pd.DataFrame) -> List[IndividualSignal]:
        """
        Wyckoff-inspired accumulation/distribution detection:
        - High volume on up days vs down days ratio
        - 'Smart money' accumulating quietly = price flat but up-volume dominates
        """
        if df is None or len(df) < 20 or "Volume" not in df.columns:
            return []

        close = df["Close"].squeeze()
        volume = df["Volume"].squeeze()
        recent = 20

        up_volume = 0.0
        down_volume = 0.0
        for i in range(-recent, 0):
            vol = float(volume.iloc[i])
            delta = float(close.iloc[i]) - float(close.iloc[i - 1])
            if delta > 0:
                up_volume += vol
            elif delta < 0:
                down_volume += vol

        if up_volume + down_volume == 0:
            return []

        ratio = up_volume / (up_volume + down_volume)
        price_20d = self._pct_change(close, 20)

        results = []
        # Accumulation: up-volume dominant but price hasn't moved much yet
        if ratio > 0.65 and abs(price_20d) < 0.05:
            results.append(IndividualSignal(
                name="Smart Money Accumulation (Wyckoff)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp(ratio),
                value=round(ratio * 100, 2),
                explanation=f"Up-volume represents {ratio*100:.0f}% of total volume over 20 days while price is flat — classic Wyckoff accumulation pattern; institutional buying building a base.",
            ))
        # Distribution: down-volume dominant but price still elevated
        elif ratio < 0.35 and abs(price_20d) < 0.05:
            results.append(IndividualSignal(
                name="Smart Money Distribution (Wyckoff)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=self._clamp(1 - ratio),
                value=round(ratio * 100, 2),
                explanation=f"Down-volume represents {(1-ratio)*100:.0f}% of total volume while price is flat — Wyckoff distribution; institutions unloading into price strength.",
            ))
        return results

    def _momentum_exhaustion(self, df: pd.DataFrame) -> List[IndividualSignal]:
        """
        Detect momentum exhaustion via:
        - Consecutive up/down days count
        - Rate of change deceleration
        """
        if df is None or len(df) < 15:
            return []

        close = df["Close"].squeeze()
        results = []

        # Consecutive candle streak
        streak = 0
        direction = None
        for i in range(-10, 0):
            diff = float(close.iloc[i]) - float(close.iloc[i - 1])
            if diff > 0:
                d = "up"
            elif diff < 0:
                d = "down"
            else:
                d = "flat"

            if direction is None:
                direction = d
                streak = 1
            elif d == direction:
                streak += 1
            else:
                direction = d
                streak = 1

        if streak >= 7 and direction == "up":
            results.append(IndividualSignal(
                name=f"Momentum Exhaustion ({streak} Consecutive Up Days)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=self._clamp(streak / 12),
                value=float(streak),
                explanation=f"{streak} consecutive up days — momentum exhaustion; statistically high probability of at least a short-term pullback.",
            ))
        elif streak >= 7 and direction == "down":
            results.append(IndividualSignal(
                name=f"Momentum Exhaustion ({streak} Consecutive Down Days)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp(streak / 12),
                value=float(streak),
                explanation=f"{streak} consecutive down days — selling exhaustion; oversold bounce likely in the near term.",
            ))

        # Rate-of-change deceleration
        if len(close) >= 30:
            roc_recent = float((close.iloc[-1] / close.iloc[-6]) - 1)
            roc_prior = float((close.iloc[-11] / close.iloc[-21]) - 1)
            if roc_prior > 0.04 and roc_recent < roc_prior * 0.4:
                results.append(IndividualSignal(
                    name="Uptrend Rate-of-Change Decelerating",
                    category=self.category,
                    direction=SignalDirection.BEARISH_REVERSAL,
                    strength=0.55,
                    explanation=f"Price rate-of-change slowing from {roc_prior*100:.1f}% to {roc_recent*100:.1f}% — uptrend losing steam; reversal risk increasing.",
                ))
            elif roc_prior < -0.04 and roc_recent > roc_prior * 0.4:
                results.append(IndividualSignal(
                    name="Downtrend Rate-of-Change Decelerating",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=0.55,
                    explanation=f"Price rate-of-change slowing in downtrend — selling pressure easing; setup for potential bullish reversal.",
                ))
        return results

    def _price_vs_news_gap(self, ticker: str, df: pd.DataFrame) -> List[IndividualSignal]:
        """
        Gap analysis: large overnight gaps often signal exhaustion or reversal.
        """
        if df is None or len(df) < 10 or "Open" not in df.columns:
            return []

        close = df["Close"].squeeze()
        open_ = df["Open"].squeeze()
        results = []

        # Check last 5 days for gaps
        gap_ups = 0
        gap_downs = 0
        for i in range(-5, 0):
            prev_close = float(close.iloc[i - 1])
            today_open = float(open_.iloc[i])
            gap_pct = (today_open - prev_close) / prev_close
            if gap_pct > 0.03:
                gap_ups += 1
            elif gap_pct < -0.03:
                gap_downs += 1

        if gap_ups >= 2:
            results.append(IndividualSignal(
                name="Multiple Gap-Up Days (Exhaustion Risk)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.55,
                value=float(gap_ups),
                explanation=f"{gap_ups} gap-up opens in last 5 days — excessive optimism often leads to gap fills; bearish exhaustion pattern.",
            ))
        elif gap_downs >= 2:
            results.append(IndividualSignal(
                name="Multiple Gap-Down Days (Capitulation)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.55,
                value=float(gap_downs),
                explanation=f"{gap_downs} gap-down opens in last 5 days — panic selling; gap-fill bounces are common after capitulation clusters.",
            ))
        return results
