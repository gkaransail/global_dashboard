from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
cache_ttl_seconds = 60
router = APIRouter()
@router.get("/")
def read_root():
    return {"status": "ok", "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}