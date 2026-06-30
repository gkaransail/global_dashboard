from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional

router = APIRouter()

_TF_MAP = {
    "1d": ("1d", "1m"),
    "2d": ("2d", "2m"),
    "5d": ("5d", "5m"),
}


def _fetch(ticker: str, timeframe: str) -> pd.DataFrame:
    if timeframe not in _TF_MAP:
        raise ValueError(f"Unsupported timeframe '{timeframe}'. Use: {list(_TF_MAP)}")
    period, interval = _TF_MAP[timeframe]
    df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if df is None or df.empty:
        raise ValueError(f"No intraday data returned for {ticker}")
    if hasattr(df.index, "tz") and df.index.tz is not None:
        df.index = df.index.tz_convert("America/New_York")
    return df


def _enrich(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    hl = (df["High"] - df["Low"]).replace(0, np.nan)

    # Delta heuristic: fraction of bar range closed toward high = buy pressure
    buy_frac = (df["Close"] - df["Low"]) / hl
    buy_frac = buy_frac.fillna(0.5)
    df["buy_vol"] = (buy_frac * df["Volume"]).round()
    df["sell_vol"] = (df["Volume"] - df["buy_vol"]).round()
    df["delta"] = df["buy_vol"] - df["sell_vol"]
    df["cum_delta"] = df["delta"].cumsum()

    # Rolling 20-bar avg volume for size context
    avg_vol = df["Volume"].rolling(20, min_periods=1).mean().replace(0, np.nan).fillna(1)
    df["vol_multiple"] = (df["Volume"] / avg_vol).round(2)
    df["is_large_print"] = df["vol_multiple"] >= 2.0

    # Absorption: big volume, narrow range relative to rolling ATR
    atr = hl.rolling(14, min_periods=1).mean().replace(0, np.nan).fillna(1)
    range_ratio = hl / atr
    df["is_absorption"] = (df["vol_multiple"] >= 1.5) & (range_ratio < 0.5)
    df["is_absorption"] = df["is_absorption"].fillna(False)

    df["candle_type"] = np.where(df["Close"] >= df["Open"], "bull", "bear")
    return df


def _bar_to_dict(row, idx) -> dict:
    return {
        "time": idx.isoformat(),
        "open": round(float(row["Open"]), 4),
        "high": round(float(row["High"]), 4),
        "low": round(float(row["Low"]), 4),
        "close": round(float(row["Close"]), 4),
        "volume": int(row["Volume"]),
        "buy_vol": int(row["buy_vol"]),
        "sell_vol": int(row["sell_vol"]),
        "delta": int(row["delta"]),
        "cum_delta": int(row["cum_delta"]),
        "vol_multiple": float(row["vol_multiple"]),
        "is_large_print": bool(row["is_large_print"]),
        "is_absorption": bool(row["is_absorption"]),
        "candle_type": str(row["candle_type"]),
    }


@router.get("/tape/{ticker}")
async def tape(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    bars = [_bar_to_dict(row, idx) for idx, row in df.iterrows()]
    total_vol = int(df["Volume"].sum())
    buy_vol = int(df["buy_vol"].sum())
    sell_vol = int(df["sell_vol"].sum())
    cum_delta = int(df["cum_delta"].iloc[-1]) if len(df) else 0
    spot = round(float(df["Close"].iloc[-1]), 4) if len(df) else None
    vwap = round(
        float((df["Close"] * df["Volume"]).sum() / df["Volume"].sum()), 4
    ) if total_vol else None
    large_count = int(df["is_large_print"].sum())
    absorption_count = int(df["is_absorption"].sum())

    return {
        "ticker": ticker.upper(),
        "timeframe": timeframe,
        "bars": bars,
        "summary": {
            "spot": spot,
            "vwap": vwap,
            "total_volume": total_vol,
            "buy_volume": buy_vol,
            "sell_volume": sell_vol,
            "cum_delta": cum_delta,
            "large_print_count": large_count,
            "absorption_count": absorption_count,
            "bias": "bullish" if cum_delta > 0 else "bearish" if cum_delta < 0 else "neutral",
        },
    }


@router.get("/large_prints/{ticker}")
async def large_prints(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
    threshold: float = Query(2.0, ge=1.1, le=10.0),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    big = df[df["vol_multiple"] >= threshold].copy()
    prints = []
    for idx, row in big.iterrows():
        prints.append({
            "time": idx.isoformat(),
            "price": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
            "buy_vol": int(row["buy_vol"]),
            "sell_vol": int(row["sell_vol"]),
            "delta": int(row["delta"]),
            "vol_multiple": float(row["vol_multiple"]),
            "candle_type": str(row["candle_type"]),
            "is_absorption": bool(row["is_absorption"]),
        })

    return {
        "ticker": ticker.upper(),
        "timeframe": timeframe,
        "threshold": threshold,
        "count": len(prints),
        "prints": prints,
    }


@router.get("/footprint/{ticker}")
async def footprint(
    ticker: str,
    timeframe: str = Query("1d", pattern="^(1d|2d|5d)$"),
    levels: int = Query(30, ge=5, le=100),
):
    try:
        df = _enrich(_fetch(ticker.upper(), timeframe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=404, detail="No data")

    price_min = float(df["Low"].min())
    price_max = float(df["High"].max())
    step = (price_max - price_min) / levels if price_max > price_min else 0.01

    buckets: dict[float, dict] = {}
    for _, row in df.iterrows():
        # Spread each bar's volume across the price levels it touched
        lo, hi = float(row["Low"]), float(row["High"])
        buy_v = float(row["buy_vol"])
        sell_v = float(row["sell_vol"])
        bar_range = hi - lo or step
        for level_price in np.arange(price_min, price_max + step, step):
            overlap = min(hi, level_price + step) - max(lo, level_price)
            if overlap <= 0:
                continue
            w = overlap / bar_range
            key = round(level_price, 4)
            if key not in buckets:
                buckets[key] = {"price": key, "buy_vol": 0.0, "sell_vol": 0.0}
            buckets[key]["buy_vol"] += buy_v * w
            buckets[key]["sell_vol"] += sell_v * w

    result_levels = []
    for b in sorted(buckets.values(), key=lambda x: -x["price"]):
        bv = int(b["buy_vol"])
        sv = int(b["sell_vol"])
        result_levels.append({
            "price": b["price"],
            "buy_vol": bv,
            "sell_vol": sv,
            "delta": bv - sv,
        })

    # Point of Control: price with highest total volume
    poc = max(result_levels, key=lambda x: x["buy_vol"] + x["sell_vol"])
    total_delta = int(df["delta"].sum())
    spot = round(float(df["Close"].iloc[-1]), 4)

    return {
        "ticker": ticker.upper(),
        "timeframe": timeframe,
        "spot": spot,
        "poc_price": poc["price"],
        "total_delta": total_delta,
        "levels": result_levels,
    }
