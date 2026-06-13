from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime

from features.reversal.models import ReversalSignal, AnalysisRequest, WatchlistRequest
from features.reversal.signals.composite import analyze_ticker
from core.data.fetcher import MACRO_TICKERS, SECTOR_ETFS, fetch_macro_data, fetch_sector_data, get_returns

router = APIRouter()


@router.get("/analyze/{ticker}", response_model=ReversalSignal)
async def analyze_single(
    ticker: str,
    explain: bool = Query(False),
    categories: Optional[str] = Query(None),
    lookback_days: int = Query(90, ge=7, le=1825),
):
    cat_list = [c.strip() for c in categories.split(",")] if categories else None
    try:
        return analyze_ticker(ticker, explain=explain, categories=cat_list, lookback_days=lookback_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze", response_model=ReversalSignal)
async def analyze_post(request: AnalysisRequest):
    try:
        return analyze_ticker(
            request.ticker,
            explain=request.explain,
            categories=request.categories,
            lookback_days=request.lookback_days or 90,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/watchlist", response_model=List[ReversalSignal])
async def analyze_watchlist(request: WatchlistRequest):
    if len(request.tickers) > 20:
        raise HTTPException(status_code=400, detail="Max 20 tickers per request.")
    results = []
    for ticker in request.tickers:
        try:
            results.append(analyze_ticker(ticker, explain=request.explain))
        except Exception:
            pass
    results.sort(key=lambda r: r.confidence, reverse=True)
    return results


@router.get("/signals/{ticker}", response_model=List[dict])
async def get_raw_signals(
    ticker: str,
    category: Optional[str] = Query(None),
):
    try:
        result = analyze_ticker(ticker, explain=False)
        signals = [s.model_dump() for s in result.signals]
        if category:
            signals = [s for s in signals if s["category"] == category]
        return signals
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sectors", response_model=List[dict])
async def get_sector_overview():
    sector_data = fetch_sector_data()
    results = []
    for etf_ticker, sector_name in SECTOR_ETFS.items():
        df = sector_data.get(etf_ticker)
        if df is None or df.empty:
            continue
        try:
            signal = analyze_ticker(etf_ticker, explain=False, categories=["technical", "breadth", "sentiment"])
            ret_5d = get_returns(df, 5)
            ret_20d = get_returns(df, 20)
            top_signals = sorted(signal.signals, key=lambda s: s.strength, reverse=True)[:2]
            results.append({
                "etf": etf_ticker,
                "sector": sector_name,
                "price": round(float(df["Close"].iloc[-1]), 2),
                "return_5d_pct": round(ret_5d * 100, 2) if ret_5d else None,
                "return_20d_pct": round(ret_20d * 100, 2) if ret_20d else None,
                "direction": signal.direction.value,
                "confidence": round(signal.confidence, 3),
                "strength": signal.strength.value,
                "signal_counts": signal.signal_counts,
                "top_signals": [
                    {"name": s.name, "direction": s.direction.value, "strength": round(s.strength, 2)}
                    for s in top_signals
                ],
            })
        except Exception:
            continue
    results.sort(key=lambda r: r["confidence"], reverse=True)
    return results[:10]


@router.get("/quote/{ticker}")
async def get_quote(ticker: str):
    from core.data.fetcher import fetch_ohlcv
    df = fetch_ohlcv(ticker.upper(), period="5d")
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker.upper()}")
    close = df["Close"]
    price = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) >= 2 else price
    change_abs = price - prev
    change_pct = (change_abs / prev) * 100 if prev else 0
    return {
        "ticker": ticker.upper(),
        "price": round(price, 2),
        "change_1d_abs": round(change_abs, 2),
        "change_1d_pct": round(change_pct, 2),
    }


@router.get("/macro", response_model=dict)
async def get_macro_snapshot():
    macro_data = fetch_macro_data()
    labels = {
        "gold": "Gold", "dxy": "DXY (Dollar)", "vix": "VIX (Fear)",
        "oil": "WTI Oil", "tnx": "10Y Yield", "copper": "Copper", "qqq": "QQQ",
    }
    snapshot = {}
    for key, ticker in MACRO_TICKERS.items():
        if key == "sp500":
            continue
        df = macro_data.get(ticker)
        if df is None or df.empty:
            snapshot[key] = None
            continue
        ret_5d = get_returns(df, 5)
        ret_20d = get_returns(df, 20)
        snapshot[key] = {
            "label": labels.get(key, key),
            "ticker": ticker,
            "price": round(float(df["Close"].iloc[-1]), 4),
            "return_5d_pct": round(ret_5d * 100, 2) if ret_5d else None,
            "return_20d_pct": round(ret_20d * 100, 2) if ret_20d else None,
        }
    return snapshot
