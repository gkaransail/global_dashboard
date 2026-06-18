"""
Model registry — add new QuantModel subclasses here to expose them via the API.
"""
from features.quant.models.regime import RegimeDetectionModel
from features.quant.models.mean_reversion import MeanReversionModel
from features.quant.models.momentum import MomentumModel
from features.quant.models.volatility import VolatilityRegimeModel

_MODELS = [
    RegimeDetectionModel(),
    MeanReversionModel(),
    MomentumModel(),
    VolatilityRegimeModel(),
]

REGISTRY: dict[str, object] = {m.id: m for m in _MODELS}


def list_models() -> list[dict]:
    return [
        {
            "id":          m.id,
            "name":        m.name,
            "description": m.description,
            "category":    m.category,
        }
        for m in _MODELS
    ]
