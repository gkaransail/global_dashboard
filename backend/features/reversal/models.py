from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class SignalDirection(str, Enum):
    BULLISH_REVERSAL = "bullish_reversal"
    BEARISH_REVERSAL = "bearish_reversal"
    NEUTRAL = "neutral"


class SignalStrength(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"


class IndividualSignal(BaseModel):
    name: str
    category: str
    direction: SignalDirection
    strength: float = Field(ge=0.0, le=1.0)
    value: Optional[float] = None
    threshold: Optional[float] = None
    explanation: Optional[str] = None


class ReversalSignal(BaseModel):
    ticker: str
    timestamp: datetime
    direction: SignalDirection
    confidence: float = Field(ge=0.0, le=1.0)
    strength: SignalStrength
    signals: List[IndividualSignal]
    signal_counts: Dict[str, int]
    explanation: Optional[str] = None
    methodology_breakdown: Optional[Dict[str, Any]] = None


class AnalysisRequest(BaseModel):
    ticker: str
    explain: bool = False
    categories: Optional[List[str]] = None
    lookback_days: Optional[int] = 90


class WatchlistRequest(BaseModel):
    tickers: List[str]
    explain: bool = False
