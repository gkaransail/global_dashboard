from fastapi import APIRouter, Query
from features.sentiment.analyzer import get_sentiment

router = APIRouter()


@router.get("/dashboard")
async def sentiment_dashboard(refresh: bool = Query(False)):
    from core import cache as _cache
    if refresh:
        _cache.invalidate("sentiment:composite")
    return get_sentiment()
