"""
Market breadth signal analyzer.

Signals:
- Sector rotation (defensive vs cyclical leading)
- S&P 500 relative performance
- New highs vs new lows proxy
- Put/Call ratio proxy via VIX term structure
- Advance/Decline proxy via sector performance spread
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from features.reversal.signals.base import BaseSignalAnalyzer
from features.reversal.models import IndividualSignal, SignalDirection
from core.data.fetcher import MACRO_TICKERS, SECTOR_ETFS, fetch_sector_data, fetch_ohlcv


DEFENSIVE_SECTORS = {"XLU", "XLP", "XLV"}    # Utilities, Staples, Healthcare
CYCLICAL_SECTORS = {"XLY", "XLK", "XLF", "XLI", "XLB"}  # Discretionary, Tech, Financials, Industrials, Materials


class BreadthSignalAnalyzer(BaseSignalAnalyzer):
    category = "breadth"

    def analyze(self, ticker: str, df: pd.DataFrame, **kwargs) -> List[IndividualSignal]:
        sector_data = kwargs.get("sector_data") or fetch_sector_data()
        macro_data = kwargs.get("macro_data") or {}
        signals: List[IndividualSignal] = []

        signals.extend(self._sector_rotation_signal(sector_data))
        signals.extend(self._sector_breadth_signal(sector_data))
        signals.extend(self._ticker_vs_market(ticker, df, macro_data))
        signals.extend(self._new_highs_lows_proxy(sector_data))
        return signals

    def _sector_rotation_signal(self, sector_data: Dict) -> List[IndividualSignal]:
        """Defensive sectors outperforming cyclicals = bearish; cyclicals leading = bullish."""
        def avg_return(tickers):
            returns = []
            for t in tickers:
                d = sector_data.get(t)
                if d is not None and len(d) >= 21:
                    r = self._pct_change(d["Close"], 20)
                    returns.append(r)
            return np.mean(returns) if returns else None

        def_ret = avg_return(DEFENSIVE_SECTORS)
        cyc_ret = avg_return(CYCLICAL_SECTORS)

        if def_ret is None or cyc_ret is None:
            return []

        spread = cyc_ret - def_ret

        if spread < -0.04:  # Defensives leading by 4%+
            return [IndividualSignal(
                name="Sector Rotation: Defensives Leading",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=self._clamp(abs(spread) * 8),
                value=round(spread * 100, 2),
                explanation=f"Defensive sectors outperforming cyclicals by {abs(spread)*100:.1f}% — classic risk-off rotation; institutions moving to safety.",
            )]
        elif spread > 0.04:  # Cyclicals leading by 4%+
            return [IndividualSignal(
                name="Sector Rotation: Cyclicals Leading",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp(spread * 8),
                value=round(spread * 100, 2),
                explanation=f"Cyclical sectors outperforming defensives by {spread*100:.1f}% — risk-on rotation; institutions buying growth.",
            )]
        return []

    def _sector_breadth_signal(self, sector_data: Dict) -> List[IndividualSignal]:
        """What % of sectors are in uptrend? Breadth thrust or collapse."""
        bullish_sectors = 0
        bearish_sectors = 0
        total = 0

        for ticker, df in sector_data.items():
            if df is None or len(df) < 21:
                continue
            total += 1
            pct = self._pct_change(df["Close"], 20)
            if pct > 0.02:
                bullish_sectors += 1
            elif pct < -0.02:
                bearish_sectors += 1

        if total == 0:
            return []

        bullish_pct = bullish_sectors / total
        bearish_pct = bearish_sectors / total
        results = []

        if bullish_pct >= 0.8:
            results.append(IndividualSignal(
                name="Breadth Thrust (Broad Rally)",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.70,
                value=round(bullish_pct * 100, 2),
                explanation=f"{int(bullish_pct*100)}% of sectors in uptrend — broad market participation signals durable move higher.",
            ))
        elif bearish_pct >= 0.8:
            results.append(IndividualSignal(
                name="Breadth Collapse (Broad Selloff)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.70,
                value=round(bearish_pct * 100, 2),
                explanation=f"{int(bearish_pct*100)}% of sectors in downtrend — widespread selling; systemic pressure, not just one sector.",
            ))
        elif bullish_pct <= 0.3 and bearish_pct >= 0.5:
            # Narrow rally was masking weakness; now collapsing
            results.append(IndividualSignal(
                name="Narrow Market Leadership Fading",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.60,
                explanation="Most sectors underperforming — market rally concentrated in few names; breadth deterioration precedes corrections.",
            ))
        return results

    def _ticker_vs_market(self, ticker: str, df: pd.DataFrame, macro_data: Dict) -> List[IndividualSignal]:
        """Is the stock diverging from the S&P 500?"""
        if df is None or len(df) < 21:
            return []
        sp500_df = macro_data.get(MACRO_TICKERS.get("sp500", "^GSPC"))
        if sp500_df is None or len(sp500_df) < 21:
            sp500_df = fetch_ohlcv("^GSPC", period="3mo")
        if sp500_df is None:
            return []

        stock_ret = self._pct_change(df["Close"], 20)
        market_ret = self._pct_change(sp500_df["Close"], 20)
        rel_strength = stock_ret - market_ret

        results = []
        if rel_strength > 0.10:
            results.append(IndividualSignal(
                name="Strong Relative Strength vs S&P 500",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=self._clamp(rel_strength * 4),
                value=round(rel_strength * 100, 2),
                explanation=f"Stock outperforming S&P 500 by {rel_strength*100:.1f}% — relative strength leader; likely to sustain if market stabilizes.",
            ))
        elif rel_strength < -0.10:
            results.append(IndividualSignal(
                name="Relative Weakness vs S&P 500",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=self._clamp(abs(rel_strength) * 4),
                value=round(rel_strength * 100, 2),
                explanation=f"Stock underperforming S&P 500 by {abs(rel_strength)*100:.1f}% — laggard; may continue to disappoint in a downturn.",
            ))
        return results

    def _new_highs_lows_proxy(self, sector_data: Dict) -> List[IndividualSignal]:
        """Use 52-week high/low proximity across sector ETFs as breadth proxy."""
        near_highs = 0
        near_lows = 0
        total = 0

        for ticker, df in sector_data.items():
            if df is None or len(df) < 200:
                continue
            total += 1
            close = df["Close"]
            high_52w = float(close.iloc[-252:].max()) if len(close) >= 252 else float(close.max())
            low_52w = float(close.iloc[-252:].min()) if len(close) >= 252 else float(close.min())
            current = float(close.iloc[-1])

            if current >= high_52w * 0.97:
                near_highs += 1
            elif current <= low_52w * 1.03:
                near_lows += 1

        if total < 5:
            return []

        results = []
        if near_highs >= total * 0.6:
            results.append(IndividualSignal(
                name="Sectors Near 52-Week Highs",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.55,
                value=round(near_highs / total * 100, 2),
                explanation=f"{near_highs}/{total} sector ETFs near 52-week highs — late-cycle breadth; euphoria risk; potential mean reversion.",
            ))
        elif near_lows >= total * 0.5:
            results.append(IndividualSignal(
                name="Sectors Near 52-Week Lows",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.65,
                value=round(near_lows / total * 100, 2),
                explanation=f"{near_lows}/{total} sector ETFs near 52-week lows — broad washout; capitulation breadth; contrarian bullish setup.",
            ))
        return results
