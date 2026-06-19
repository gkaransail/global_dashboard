"""
Base class for all quant models.
Each model must implement analyze(ticker) and return a standardized result dict.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class QuantResult:
    ticker: str
    model_id: str
    model_name: str
    category: str           # e.g. 'regime', 'momentum', 'sentiment', ...
    timeframe: str          # 'short' | 'long' | 'meta'
    direction: int          # 1 bull / -1 bear / 0 neutral
    confidence: float       # 0-100
    regime: str             # human-readable current state label
    summary: str            # 1-2 sentence plain-English explanation
    signals: list[str]      # bullet-point supporting evidence
    chart_data: dict        # time series for frontend charts
    meta: dict = field(default_factory=dict)   # model-specific extras

    def to_dict(self) -> dict:
        return {
            "ticker":      self.ticker,
            "model_id":    self.model_id,
            "model_name":  self.model_name,
            "category":    self.category,
            "timeframe":   self.timeframe,
            "direction":   self.direction,
            "confidence":  self.confidence,
            "regime":      self.regime,
            "summary":     self.summary,
            "signals":     self.signals,
            "chart_data":  self.chart_data,
            "meta":        self.meta,
        }


class QuantModel(ABC):
    id: str
    name: str
    description: str
    category: str    # 'regime' | 'momentum' | 'reversion' | 'factor' | 'volatility' | ...
    timeframe: str   # 'short' | 'long' | 'meta'

    @abstractmethod
    def analyze(self, ticker: str) -> QuantResult:
        """Run the model on a ticker and return a QuantResult."""
        ...
