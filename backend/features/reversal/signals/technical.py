"""
Technical signal analyzer.

Signals:
- RSI divergence (price makes new high/low but RSI doesn't)
- MACD crossover / histogram flip
- Bollinger Band squeeze + breakout direction
- Volume divergence (price rising on falling volume = weakness)
- MA crossovers (50/200 golden/death cross, 20/50)
- Price vs VWAP deviation
"""

import pandas as pd
import numpy as np
from typing import List
from features.reversal.signals.base import BaseSignalAnalyzer
from features.reversal.models import IndividualSignal, SignalDirection


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series):
    fast = _ema(close, 12)
    slow = _ema(close, 26)
    macd_line = fast - slow
    signal_line = _ema(macd_line, 9)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger(close: pd.Series, window: int = 20, num_std: float = 2.0):
    sma = close.rolling(window).mean()
    std = close.rolling(window).std()
    upper = sma + num_std * std
    lower = sma - num_std * std
    bandwidth = (upper - lower) / sma
    return sma, upper, lower, bandwidth


class TechnicalSignalAnalyzer(BaseSignalAnalyzer):
    category = "technical"

    def analyze(self, ticker: str, df: pd.DataFrame, **kwargs) -> List[IndividualSignal]:
        if df is None or len(df) < 50:
            return []
        signals: List[IndividualSignal] = []
        close = df["Close"].squeeze()
        volume = df["Volume"].squeeze() if "Volume" in df.columns else None

        signals.extend(self._rsi_signals(close))
        signals.extend(self._macd_signals(close))
        signals.extend(self._bollinger_signals(close))
        signals.extend(self._ma_crossover_signals(close))
        if volume is not None:
            signals.extend(self._volume_divergence_signals(close, volume))
        return signals

    def _rsi_signals(self, close: pd.Series) -> List[IndividualSignal]:
        rsi = _rsi(close)
        if len(rsi.dropna()) < 5:
            return []

        current_rsi = float(rsi.iloc[-1])
        results = []

        # Overbought/oversold
        if current_rsi < 30:
            strength = self._clamp((30 - current_rsi) / 30 + 0.4)
            results.append(IndividualSignal(
                name="RSI Oversold",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=strength,
                value=round(current_rsi, 2),
                threshold=30.0,
                explanation=f"RSI at {current_rsi:.1f} — deeply oversold; mean-reversion bounce likely.",
            ))
        elif current_rsi > 70:
            strength = self._clamp((current_rsi - 70) / 30 + 0.4)
            results.append(IndividualSignal(
                name="RSI Overbought",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=strength,
                value=round(current_rsi, 2),
                threshold=70.0,
                explanation=f"RSI at {current_rsi:.1f} — overbought territory; momentum exhaustion risk.",
            ))

        # Bullish divergence: price lower low but RSI higher low
        if len(close) >= 20:
            price_5d_low = close.iloc[-5:].min()
            price_20d_low = close.iloc[-20:-5].min()
            rsi_5d_low = rsi.iloc[-5:].min()
            rsi_20d_low = rsi.iloc[-20:-5].min()

            if price_5d_low < price_20d_low and rsi_5d_low > rsi_20d_low and current_rsi < 45:
                results.append(IndividualSignal(
                    name="RSI Bullish Divergence",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=0.72,
                    value=round(current_rsi, 2),
                    explanation="Price made a lower low but RSI made a higher low — classic bullish divergence indicating weakening selling pressure.",
                ))
            elif price_5d_low > price_20d_low and rsi_5d_low < rsi_20d_low and current_rsi > 55:
                results.append(IndividualSignal(
                    name="RSI Bearish Divergence",
                    category=self.category,
                    direction=SignalDirection.BEARISH_REVERSAL,
                    strength=0.72,
                    value=round(current_rsi, 2),
                    explanation="Price made a higher high but RSI made a lower high — bearish divergence indicating weakening buying pressure.",
                ))
        return results

    def _macd_signals(self, close: pd.Series) -> List[IndividualSignal]:
        if len(close) < 35:
            return []
        macd_line, signal_line, hist = _macd(close)
        results = []

        # Crossover in last 3 bars
        for i in range(-3, 0):
            prev_hist = hist.iloc[i - 1]
            curr_hist = hist.iloc[i]
            if pd.isna(prev_hist) or pd.isna(curr_hist):
                continue
            if prev_hist < 0 and curr_hist > 0:
                results.append(IndividualSignal(
                    name="MACD Bullish Crossover",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=0.65,
                    value=round(float(curr_hist), 4),
                    explanation=f"MACD line crossed above signal line — momentum shifting bullish.",
                ))
                break
            elif prev_hist > 0 and curr_hist < 0:
                results.append(IndividualSignal(
                    name="MACD Bearish Crossover",
                    category=self.category,
                    direction=SignalDirection.BEARISH_REVERSAL,
                    strength=0.65,
                    value=round(float(curr_hist), 4),
                    explanation=f"MACD line crossed below signal line — momentum shifting bearish.",
                ))
                break

        # Histogram divergence: shrinking histogram in direction of trend
        if len(hist.dropna()) >= 5:
            recent = hist.dropna().iloc[-5:]
            if all(recent > 0) and recent.iloc[-1] < recent.iloc[-3]:
                results.append(IndividualSignal(
                    name="MACD Histogram Weakening (Bullish)",
                    category=self.category,
                    direction=SignalDirection.BEARISH_REVERSAL,
                    strength=0.50,
                    explanation="MACD histogram shrinking while positive — uptrend momentum fading, potential reversal ahead.",
                ))
            elif all(recent < 0) and recent.iloc[-1] > recent.iloc[-3]:
                results.append(IndividualSignal(
                    name="MACD Histogram Weakening (Bearish)",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=0.50,
                    explanation="MACD histogram shrinking while negative — downtrend momentum fading, potential bullish reversal.",
                ))
        return results

    def _bollinger_signals(self, close: pd.Series) -> List[IndividualSignal]:
        if len(close) < 25:
            return []
        sma, upper, lower, bw = _bollinger(close)
        results = []

        price = float(close.iloc[-1])
        upper_val = float(upper.iloc[-1])
        lower_val = float(lower.iloc[-1])
        bw_current = float(bw.iloc[-1])
        bw_20d_avg = float(bw.iloc[-20:].mean()) if len(bw) >= 20 else bw_current

        # Squeeze: bandwidth very low → breakout imminent
        if bw_current < bw_20d_avg * 0.7:
            # Determine likely direction from recent price action
            recent_slope = float(close.iloc[-5:].mean()) - float(close.iloc[-10:-5].mean())
            direction = SignalDirection.BULLISH_REVERSAL if recent_slope > 0 else SignalDirection.BEARISH_REVERSAL
            results.append(IndividualSignal(
                name="Bollinger Band Squeeze",
                category=self.category,
                direction=direction,
                strength=0.60,
                value=round(bw_current, 4),
                explanation=f"Bollinger Bands tightening to {bw_current:.3f} vs {bw_20d_avg:.3f} avg — low volatility squeeze often precedes an explosive move.",
            ))

        # Price touching/crossing bands
        if price <= lower_val:
            results.append(IndividualSignal(
                name="Price at Lower Bollinger Band",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.60,
                value=round(price, 2),
                threshold=round(lower_val, 2),
                explanation=f"Price ${price:.2f} touching lower Bollinger Band ${lower_val:.2f} — statistically oversold; mean reversion likely.",
            ))
        elif price >= upper_val:
            results.append(IndividualSignal(
                name="Price at Upper Bollinger Band",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.55,
                value=round(price, 2),
                threshold=round(upper_val, 2),
                explanation=f"Price ${price:.2f} touching upper Bollinger Band ${upper_val:.2f} — statistically overbought; pullback risk.",
            ))
        return results

    def _ma_crossover_signals(self, close: pd.Series) -> List[IndividualSignal]:
        results = []

        def check_cross(fast_w: int, slow_w: int, label: str):
            if len(close) < slow_w + 5:
                return
            fast = close.rolling(fast_w).mean()
            slow = close.rolling(slow_w).mean()
            # Check if crossover happened in last 5 bars
            for i in range(-5, 0):
                f_prev, f_curr = float(fast.iloc[i-1]), float(fast.iloc[i])
                s_prev, s_curr = float(slow.iloc[i-1]), float(slow.iloc[i])
                if pd.isna(f_prev) or pd.isna(s_prev):
                    continue
                if f_prev < s_prev and f_curr >= s_curr:
                    strength = 0.80 if slow_w == 200 else 0.60
                    results.append(IndividualSignal(
                        name=f"{label} Golden Cross",
                        category=self.category,
                        direction=SignalDirection.BULLISH_REVERSAL,
                        strength=strength,
                        explanation=f"{fast_w}MA crossed above {slow_w}MA — {label}; historically strong bullish signal.",
                    ))
                    return
                elif f_prev > s_prev and f_curr <= s_curr:
                    strength = 0.80 if slow_w == 200 else 0.60
                    results.append(IndividualSignal(
                        name=f"{label} Death Cross",
                        category=self.category,
                        direction=SignalDirection.BEARISH_REVERSAL,
                        strength=strength,
                        explanation=f"{fast_w}MA crossed below {slow_w}MA — {label}; historically strong bearish signal.",
                    ))
                    return

        check_cross(50, 200, "50/200 MA")
        check_cross(20, 50, "20/50 MA")

        # Price vs 200 MA regime
        if len(close) >= 200:
            ma200 = float(close.rolling(200).mean().iloc[-1])
            price = float(close.iloc[-1])
            dev = (price - ma200) / ma200
            if dev < -0.15:
                results.append(IndividualSignal(
                    name="Price Far Below 200MA",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=self._clamp(abs(dev) * 2),
                    value=round(dev * 100, 2),
                    explanation=f"Price is {dev*100:.1f}% below 200-day MA — historically extreme; mean reversion trades have high hit rate.",
                ))
            elif dev > 0.25:
                results.append(IndividualSignal(
                    name="Price Extended Above 200MA",
                    category=self.category,
                    direction=SignalDirection.BEARISH_REVERSAL,
                    strength=self._clamp(dev * 2),
                    value=round(dev * 100, 2),
                    explanation=f"Price is {dev*100:.1f}% above 200-day MA — historically stretched; reversion risk elevated.",
                ))
        return results

    def _volume_divergence_signals(self, close: pd.Series, volume: pd.Series) -> List[IndividualSignal]:
        if len(close) < 20 or len(volume) < 20:
            return []
        results = []

        price_trend = self._trend(close, 10)
        vol_trend = self._trend(volume, 10)

        # Price up, volume down = weakening uptrend
        if price_trend == "up" and vol_trend == "down":
            results.append(IndividualSignal(
                name="Volume Divergence (Price Up, Volume Down)",
                category=self.category,
                direction=SignalDirection.BEARISH_REVERSAL,
                strength=0.60,
                explanation="Price rising on declining volume — uptrend lacks conviction; distribution phase possible.",
            ))
        # Price down, volume down = weakening downtrend (buyers absorbing)
        elif price_trend == "down" and vol_trend == "down":
            results.append(IndividualSignal(
                name="Volume Contraction in Downtrend",
                category=self.category,
                direction=SignalDirection.BULLISH_REVERSAL,
                strength=0.50,
                explanation="Price falling on declining volume — selling pressure diminishing; potential exhaustion of downtrend.",
            ))
        # Price down, volume spike = capitulation
        elif price_trend == "down" and vol_trend == "up":
            recent_vol = float(volume.iloc[-5:].mean())
            avg_vol = float(volume.iloc[-20:].mean())
            if recent_vol > avg_vol * 1.5:
                results.append(IndividualSignal(
                    name="High-Volume Capitulation",
                    category=self.category,
                    direction=SignalDirection.BULLISH_REVERSAL,
                    strength=0.70,
                    value=round(recent_vol / avg_vol, 2),
                    explanation=f"Volume spike ({recent_vol/avg_vol:.1f}x avg) during downtrend — panic selling/capitulation; often marks trend reversal lows.",
                ))
        return results
