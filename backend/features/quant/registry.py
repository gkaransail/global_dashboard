"""
Model registry — add new QuantModel subclasses here to expose them via the API.
"""
from features.quant.models.regime        import RegimeDetectionModel
from features.quant.models.mean_reversion import MeanReversionModel
from features.quant.models.momentum      import MomentumModel
from features.quant.models.volatility    import VolatilityRegimeModel
from features.quant.models.factor        import FactorModel
from features.quant.models.fundamental   import FundamentalHealthModel
from features.quant.models.sentiment     import SentimentModel
from features.quant.models.options_flow  import OptionsFlowModel
from features.quant.models.ensemble      import EnsembleModel

_MODELS = [
    RegimeDetectionModel(),
    MeanReversionModel(),
    MomentumModel(),
    VolatilityRegimeModel(),
    FactorModel(),
    FundamentalHealthModel(),
    SentimentModel(),
    OptionsFlowModel(),
    EnsembleModel(),
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
