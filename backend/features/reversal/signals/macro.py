"""
Macro signal analyzer.

Logic summary:
- Gold rising + DXY falling → risk-off → bearish reversal for equities
- Gold rising + DXY rising → flight-to-safety → bearish for risky assets
- VIX spike (>25) → fear elevated, potential capitulation → watch for bullish reversal
- Oil crash → deflationary signal → bearish for cyclicals
- 10Y yield rising fast → rate pressure → bearish for growth/tech
- Copper rising → economic expansion → bullish
"""

import pandas as pd
import numpy as np
from typing import List, Optional, Dict
from features.reversal.signals.base import BaseSignalAnalyzer
from features.reversal.models import IndividualSignal, SignalDirection
from core.data.fetcher import MACRO_TICKERS, fetch_macro_data


class MacroSignalAnalyzer(BaseSignalAnalyzer):
    category = "macro"

    def analyze(self, ticker: str, df: pd.DataFrame, **kwargs) -> List[IndividualSignal]:
        macro_data = kwargs.get("macro_data") or fetch_macro_data()
        signals: List[IndividualSignal] = []

        signals.extend(self._gold_signal(macro_data))
        signals.extend(self._dxy_signal(macro_data))
        signals.extend(self._vix_signal(macro_data))
        signals.extend(self._oil_signal(macro_data))
        signals.extend(self._yield_signal(macro_data))
        signals.extend(self._copper_signal(macro_data))
        signals.extend(self._gold_dxy_interplay(macro_data))

        return signals

    def _gold_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["gold"])
        if df is None or df.empty:
            return []
        trend = self._trend(df["Close"], window=10)
        pct = self._pct_change(df["Close"], 20)
        strength = self._clamp(abs(pct) * 5)

        if trend == "up":
            return [IndividualSignal(
                name="Gold Rising",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"Gold up {pct*100:.1f}% over 20 days — risk-off sentiment building, equities may face headwinds.",
            )]
        elif trend == "down":
            return [IndividualSignal(
                name="Gold Falling",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"Gold down {pct*100:.1f}% over 20 days — risk appetite improving, equities may benefit.",
            )]
        return []

    def _dxy_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["dxy"])
        if df is None or df.empty:
            return []
        trend = self._trend(df["Close"], window=10)
        pct = self._pct_change(df["Close"], 20)
        strength = self._clamp(abs(pct) * 8)

        if trend == "up":
            return [IndividualSignal(
                name="Dollar Strengthening (DXY)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"DXY up {pct*100:.1f}% — strong dollar pressures multinationals and commodities; bearish for broad equities.",
            )]
        elif trend == "down":
            return [IndividualSignal(
                name="Dollar Weakening (DXY)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"DXY down {pct*100:.1f}% — weaker dollar supports commodities and international earnings; bullish tailwind.",
            )]
        return []

    def _vix_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["vix"])
        if df is None or df.empty:
            return []
        vix = float(df["Close"].iloc[-1])
        vix_5d_avg = float(df["Close"].iloc[-5:].mean()) if len(df) >= 5 else vix
        vix_20d_avg = float(df["Close"].iloc[-20:].mean()) if len(df) >= 20 else vix

        if vix > 35:
            # Extreme fear — contrarian bullish
            return [IndividualSignal(
                name="VIX Extreme Fear",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp((vix - 35) / 20 + 0.6),
                value=round(vix, 2),
                explanation=f"VIX at {vix:.1f} — extreme fear level historically precedes capitulation and bullish reversals.",
            )]
        elif vix > 25:
            return [IndividualSignal(
                name="VIX Elevated Fear",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp((vix - 20) / 30),
                value=round(vix, 2),
                explanation=f"VIX at {vix:.1f} — elevated fear; watch for exhaustion and potential bullish reversal.",
            )]
        elif vix < 13 and vix_5d_avg < vix_20d_avg * 0.9:
            return [IndividualSignal(
                name="VIX Complacency",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.55,
                value=round(vix, 2),
                explanation=f"VIX at {vix:.1f} — extreme complacency; low volatility regimes often precede sharp selloffs.",
            )]
        return []

    def _oil_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["oil"])
        if df is None or df.empty:
            return []
        pct = self._pct_change(df["Close"], 20)
        trend = self._trend(df["Close"], window=10)
        strength = self._clamp(abs(pct) * 4)

        if pct < -0.15:
            return [IndividualSignal(
                name="Oil Price Crash",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"Oil down {pct*100:.1f}% — deflationary signal; energy sector and cyclicals under pressure.",
            )]
        elif pct > 0.15:
            return [IndividualSignal(
                name="Oil Price Surge",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength * 0.7,
                value=round(pct * 100, 2),
                explanation=f"Oil up {pct*100:.1f}% — inflationary pressure; may squeeze margins and prompt Fed hawkishness.",
            )]
        return []

    def _yield_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["tnx"])
        if df is None or df.empty:
            return []
        pct = self._pct_change(df["Close"], 20)
        current_yield = float(df["Close"].iloc[-1])
        strength = self._clamp(abs(pct) * 3)

        if pct > 0.08 and current_yield > 4.0:
            return [IndividualSignal(
                name="10Y Yield Spiking",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(current_yield, 2),
                threshold=4.0,
                explanation=f"10Y yield at {current_yield:.2f}%, up {pct*100:.1f}% — rising rates compress equity valuations, especially growth stocks.",
            )]
        elif pct < -0.08:
            return [IndividualSignal(
                name="10Y Yield Falling",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=strength,
                value=round(current_yield, 2),
                explanation=f"10Y yield falling to {current_yield:.2f}% — easing rate pressure supports equity multiples.",
            )]
        return []

    def _copper_signal(self, macro_data: Dict) -> List[IndividualSignal]:
        df = macro_data.get(MACRO_TICKERS["copper"])
        if df is None or df.empty:
            return []
        pct = self._pct_change(df["Close"], 20)
        strength = self._clamp(abs(pct) * 5)

        if pct > 0.05:
            return [IndividualSignal(
                name="Copper Rising (Dr. Copper)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"Copper up {pct*100:.1f}% — often a leading indicator of global economic expansion; bullish for industrials and equities.",
            )]
        elif pct < -0.05:
            return [IndividualSignal(
                name="Copper Falling (Dr. Copper)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(pct * 100, 2),
                explanation=f"Copper down {pct*100:.1f}% — leading indicator of slowdown; potential bearish signal for the broader market.",
            )]
        return []

    def _gold_dxy_interplay(self, macro_data: Dict) -> List[IndividualSignal]:
        """Gold and DXY moving together = flight-to-safety (more bearish); moving opposite = normal risk-off."""
        gold_df = macro_data.get(MACRO_TICKERS["gold"])
        dxy_df = macro_data.get(MACRO_TICKERS["dxy"])
        if gold_df is None or dxy_df is None:
            return []

        gold_pct = self._pct_change(gold_df["Close"], 10)
        dxy_pct = self._pct_change(dxy_df["Close"], 10)

        # Both rising = flight-to-safety, panic buying
        if gold_pct > 0.03 and dxy_pct > 0.01:
            return [IndividualSignal(
                name="Gold+DXY Both Rising (Flight to Safety)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.75,
                explanation="Gold and USD both rising simultaneously — classic flight-to-safety signal indicating severe risk-off; historically precedes sharp equity selloffs.",
            )]
        return []
