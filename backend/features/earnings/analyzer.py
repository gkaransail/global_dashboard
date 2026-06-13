"""
Earnings analyzer — fetches upcoming earnings dates, expected move from the
options chain, and historical EPS surprises for a ticker.
"""
import math
import logging
from datetime import date, datetime, timedelta
from typing import Optional
import yfinance as yf
from core import cache as _cache

logger = logging.getLogger(__name__)
CACHE_TTL = 300  # 5 min — earnings dates don't change intraday


# Default watchlist shown on the calendar
DEFAULT_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "JPM", "BAC", "GS", "AMD", "NFLX", "CRM", "ORCL", "INTC",
]


def _spot_price(t: yf.Ticker) -> Optional[float]:
    try:
        return float(t.fast_info.last_price)
    except Exception:
        return None


def _expected_move(ticker: str, dte: int) -> Optional[dict]:
    """
    ATM straddle approach: expected move = spot × ATM_IV × √(DTE/365)
    Returns {"pct": float, "dollar": float, "atm_iv": float} or None.
    """
    try:
        t = yf.Ticker(ticker)
        spot = _spot_price(t)
        if not spot:
            return None

        exps = t.options
        if not exps:
            return None

        today = date.today()
        # Pick the expiration closest to the earnings date
        best_exp = None
        best_diff = 9999
        for exp in exps:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            diff = abs((exp_date - today).days - dte)
            if diff < best_diff:
                best_diff = diff
                best_exp = exp

        if not best_exp:
            return None

        chain = t.option_chain(best_exp)
        calls = chain.calls
        if calls.empty:
            return None

        # Find ATM call
        atm = calls.iloc[(calls["strike"] - spot).abs().argsort()[:1]]
        iv = float(atm["impliedVolatility"].values[0])
        if iv <= 0:
            return None

        actual_dte = max(dte, 1)
        T = actual_dte / 365
        move_pct = round(iv * math.sqrt(T) * 100, 1)
        move_dollar = round(spot * iv * math.sqrt(T), 2)

        return {
            "pct": move_pct,
            "dollar": move_dollar,
            "atm_iv": round(iv * 100, 1),
        }
    except Exception as e:
        logger.debug(f"Expected move failed for {ticker}: {e}")
        return None


def _earnings_history(t: yf.Ticker) -> list[dict]:
    """
    Returns last 8 quarters of EPS: estimate, actual, surprise %, and
    the actual stock price move on earnings day.
    """
    try:
        import pandas as pd
        dates_df = t.earnings_dates
        if dates_df is None or dates_df.empty:
            return []

        history = []
        hist_prices = t.history(period="2y", interval="1d")
        # Normalize price index to date strings for lookup
        price_by_date = {}
        if not hist_prices.empty:
            for ts, row in hist_prices.iterrows():
                d_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                price_by_date[d_str] = float(row["Close"])

        price_dates = sorted(price_by_date.keys())

        for idx, row in dates_df.iterrows():
            earn_date = idx.date() if hasattr(idx, "date") else idx
            if earn_date > date.today():
                continue

            eps_est = row.get("EPS Estimate")
            eps_act = row.get("Reported EPS")
            surprise_pct_raw = row.get("Surprise(%)")

            # Use yfinance's pre-calculated surprise if available
            surprise_pct = None
            if pd.notna(surprise_pct_raw):
                surprise_pct = round(float(surprise_pct_raw), 1)
            elif eps_est and eps_act and pd.notna(eps_est) and pd.notna(eps_act) and eps_est != 0:
                surprise_pct = round(((eps_act - eps_est) / abs(eps_est)) * 100, 1)

            # Stock price move on earnings day vs prior day
            price_move_pct = None
            earn_str = earn_date.strftime("%Y-%m-%d")
            if earn_str in price_by_date:
                loc = price_dates.index(earn_str)
                if loc > 0:
                    prev_close = price_by_date[price_dates[loc - 1]]
                    day_close = price_by_date[earn_str]
                    price_move_pct = round(((day_close - prev_close) / prev_close) * 100, 2)

            history.append({
                "date": earn_str,
                "eps_estimate": round(float(eps_est), 2) if pd.notna(eps_est) else None,
                "eps_actual": round(float(eps_act), 2) if pd.notna(eps_act) else None,
                "surprise_pct": surprise_pct,
                "beat": surprise_pct > 0 if surprise_pct is not None else None,
                "price_move_pct": price_move_pct,
            })

            if len(history) >= 8:
                break

        return history
    except Exception as e:
        logger.debug(f"Earnings history failed: {e}")
        return []


def _next_earnings_date(t: yf.Ticker) -> Optional[date]:
    """Returns the next upcoming earnings date, or None."""
    try:
        # Prefer calendar (more reliable for next date)
        cal = t.calendar
        if cal and "Earnings Date" in cal:
            dates = cal["Earnings Date"]
            if dates:
                d = dates[0] if isinstance(dates, list) else dates
                return d if isinstance(d, date) else d.date()

        # Fallback: scan earnings_dates for first future row
        dates_df = t.earnings_dates
        if dates_df is None or dates_df.empty:
            return None
        today = date.today()
        for idx in dates_df.index:
            earn_date = idx.date() if hasattr(idx, "date") else idx
            if earn_date >= today:
                return earn_date
        return None
    except Exception:
        return None


def get_calendar(tickers: list[str], days_ahead: int = 30) -> list[dict]:
    """
    For each ticker, return upcoming earnings within the next `days_ahead` days
    with the expected move from options.
    """
    cache_key = f"earnings_calendar_{','.join(sorted(tickers))}_{days_ahead}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    results = []
    cutoff = date.today() + timedelta(days=days_ahead)

    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            earn_date = _next_earnings_date(t)
            if not earn_date or earn_date > cutoff:
                continue

            spot = _spot_price(t)
            dte = (earn_date - date.today()).days
            em = _expected_move(ticker, max(dte, 1))

            # Average historical move magnitude
            history = _earnings_history(t)
            past_moves = [abs(h["price_move_pct"]) for h in history if h["price_move_pct"] is not None]
            avg_move = round(sum(past_moves) / len(past_moves), 1) if past_moves else None

            # Beat rate
            beats = [h["beat"] for h in history if h["beat"] is not None]
            beat_rate = round(sum(beats) / len(beats) * 100) if beats else None

            results.append({
                "ticker": ticker,
                "earnings_date": earn_date.strftime("%Y-%m-%d"),
                "dte": dte,
                "spot": round(spot, 2) if spot else None,
                "expected_move_pct": em["pct"] if em else None,
                "expected_move_dollar": em["dollar"] if em else None,
                "atm_iv": em["atm_iv"] if em else None,
                "avg_historical_move_pct": avg_move,
                "beat_rate_pct": beat_rate,
                "quarters_sampled": len(history),
            })
        except Exception as e:
            logger.warning(f"Calendar failed for {ticker}: {e}")

    results.sort(key=lambda r: r["dte"])
    _cache.set(cache_key, results)
    return results


def get_analysis(ticker: str) -> dict:
    """
    Full earnings analysis for a single ticker:
    - Next earnings date + expected move
    - Last 8 quarters of EPS history + price reaction
    - Summary stats
    """
    cache_key = f"earnings_analysis_{ticker}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    t = yf.Ticker(ticker)
    spot = _spot_price(t)
    earn_date = _next_earnings_date(t)
    dte = (earn_date - date.today()).days if earn_date else None
    em = _expected_move(ticker, max(dte, 1)) if dte is not None else None
    history = _earnings_history(t)

    past_moves = [abs(h["price_move_pct"]) for h in history if h["price_move_pct"] is not None]
    avg_move = round(sum(past_moves) / len(past_moves), 1) if past_moves else None
    max_move = round(max(past_moves), 1) if past_moves else None

    beats = [h["beat"] for h in history if h["beat"] is not None]
    beat_rate = round(sum(beats) / len(beats) * 100) if beats else None

    # Is the market over or under pricing this earnings?
    pricing_signal = None
    if em and avg_move:
        if em["pct"] > avg_move * 1.2:
            pricing_signal = "overpriced"   # options pricing in more than history suggests
        elif em["pct"] < avg_move * 0.8:
            pricing_signal = "underpriced"  # options pricing in less than history suggests
        else:
            pricing_signal = "fairly_priced"

    result = {
        "ticker": ticker.upper(),
        "spot": round(spot, 2) if spot else None,
        "next_earnings_date": earn_date.strftime("%Y-%m-%d") if earn_date else None,
        "dte": dte,
        "expected_move": em,
        "pricing_signal": pricing_signal,
        "summary": {
            "avg_historical_move_pct": avg_move,
            "max_historical_move_pct": max_move,
            "beat_rate_pct": beat_rate,
            "quarters_sampled": len(history),
        },
        "history": history,
    }

    _cache.set(cache_key, result)
    return result
