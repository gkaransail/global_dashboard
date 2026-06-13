from abc import ABC, abstractmethod
from typing import List
from features.reversal.models import IndividualSignal, SignalDirection
import pandas as pd


class BaseSignalAnalyzer(ABC):
    category: str = "base"

    @abstractmethod
    def analyze(self, ticker: str, df: pd.DataFrame, **kwargs) -> List[IndividualSignal]: ...

    @staticmethod
    def _trend(series: pd.Series, window: int = 10) -> str:
        if len(series) < window + 1:
            return "neutral"
        recent = series.iloc[-window:].mean()
        prior = series.iloc[-window * 2: -window].mean() if len(series) >= window * 2 else series.iloc[:window].mean()
        if recent > prior * 1.01:
            return "up"
        elif recent < prior * 0.99:
            return "down"
        return "neutral"

    @staticmethod
    def _pct_change(series: pd.Series, periods: int = 20) -> float:
        if len(series) < periods + 1:
            return 0.0
        return float((series.iloc[-1] / series.iloc[-periods - 1]) - 1)

    @staticmethod
    def _clamp(val: float, lo: float = 0.0, hi: float = 1.0) -> float:
        return max(lo, min(hi, val))
