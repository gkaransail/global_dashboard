"""
Options flow scanner: scores ~80 liquid stocks and returns top 20 bullish + bearish.
Scoring: P/C OI ratio (±3) + max pain direction (±1) + IV rank (±1) = max ±5.
Results cached 30 min — first run takes ~25-40s due to parallel yfinance calls.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from core import cache as _cache
from features.options.analyzers.analysis import get_analysis

logger = logging.getLogger(__name__)

SCAN_CACHE_TTL = 1800  # 30 min

UNIVERSE = [
    # Mega cap tech / Mag 7
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
    # Semiconductors
    'AMD', 'INTC', 'MU', 'AMAT', 'AVGO', 'QCOM', 'ARM', 'LRCX', 'KLAC', 'MRVL', 'TXN', 'MCHP',
    # Software / Cloud / AI / Cybersecurity
    'CRM', 'ADBE', 'NOW', 'SNOW', 'ORCL', 'PLTR', 'DDOG', 'NET', 'ZS', 'CRWD', 'PANW', 'S',
    # Financials / Fintech / Banks
    'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'C', 'WFC', 'COIN', 'SQ', 'PYPL',
    # Healthcare / Pharma / Biotech
    'UNH', 'JNJ', 'PFE', 'MRNA', 'LLY', 'ABBV', 'BMY', 'GILD', 'AMGN', 'REGN',
    # Energy
    'XOM', 'CVX', 'OXY', 'SLB', 'HAL',
    # Consumer / Retail
    'HD', 'WMT', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'AMZN',
    # Media / Entertainment / Streaming
    'NFLX', 'DIS', 'ROKU', 'SPOT',
    # Transport / EV / Rideshare
    'UBER', 'RIVN', 'F', 'GM',
    # Liquid ETFs (very deep options markets)
    'SPY', 'QQQ', 'IWM', 'GLD', 'TLT', 'XLF', 'XLE', 'XLK', 'SMH', 'ARKK',
    # High-vol / speculative
    'SMCI', 'MSTR', 'GME', 'SHOP', 'RBLX',
]
# Deduplicate while preserving order (AMZN appears in both tech and consumer)
_seen = set()
UNIVERSE = [t for t in UNIVERSE if not (_seen.add(t) or t in _seen)]


def _score_ticker(ticker: str, timeframe: str) -> dict | None:
    """Score a single ticker. Returns None on any error or missing data."""
    try:
        data = get_analysis(ticker, timeframe)
    except Exception as e:
        logger.debug(f"Scanner: {ticker} failed: {e}")
        return None

    pc    = data.get('pc_ratio')
    spot  = data.get('spot_price')
    if not pc or not spot:
        return None

    iv_rank  = data.get('iv_rank')
    max_pain = data.get('max_pain')
    em       = data.get('expected_move')
    atm_iv   = data.get('atm_iv_pct')

    score   = 0
    signals = []

    # ── P/C OI ratio — primary signal (±3) ───────────────────────────────
    if pc < 0.6:
        score += 3
        signals.append(f'Strong call dominance (P/C {pc:.2f})')
    elif pc < 0.8:
        score += 2
        signals.append(f'Call-heavy positioning (P/C {pc:.2f})')
    elif pc < 1.0:
        score += 1
        signals.append(f'Mild bullish bias (P/C {pc:.2f})')
    elif pc < 1.2:
        score -= 1
        signals.append(f'Mild bearish bias (P/C {pc:.2f})')
    elif pc < 1.5:
        score -= 2
        signals.append(f'Put-heavy positioning (P/C {pc:.2f})')
    else:
        score -= 3
        signals.append(f'Strong put dominance (P/C {pc:.2f})')

    # ── Max pain direction (±1) ───────────────────────────────────────────
    if max_pain and spot:
        gap = (max_pain - spot) / spot
        if gap > 0.02:
            score += 1
            signals.append(f'Max pain above spot (${max_pain:.0f})')
        elif gap < -0.02:
            score -= 1
            signals.append(f'Max pain below spot (${max_pain:.0f})')

    # ── IV rank context (±1) ──────────────────────────────────────────────
    if iv_rank is not None:
        if iv_rank > 70:
            score -= 1
            signals.append(f'Elevated IV rank ({iv_rank:.0f}) — fear priced in')
        elif iv_rank < 25:
            score += 1
            signals.append(f'Low IV rank ({iv_rank:.0f}) — quiet/complacent market')

    score = max(-5, min(5, score))

    return {
        'ticker':           ticker,
        'score':            score,
        'direction':        'bullish' if score > 0 else 'bearish' if score < 0 else 'neutral',
        'spot_price':       round(spot, 2),
        'pc_ratio':         round(pc, 2),
        'atm_iv_pct':       atm_iv,
        'iv_rank':          iv_rank,
        'expected_move':    em,
        'max_pain':         max_pain,
        'signals':          signals,
        'expiration_label': data.get('selected_expiration', {}).get('label'),
    }


def get_top_movers(timeframe: str = '1mo') -> dict:
    """
    Parallel scan of UNIVERSE. Returns top 20 bullish + bearish by score.
    Cached 30 min — subsequent calls within that window are instant.
    """
    cache_key = f'options:scanner:{timeframe}'
    cached = _cache.get(cache_key, SCAN_CACHE_TTL)
    if cached:
        return cached

    results = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_score_ticker, t, timeframe): t for t in UNIVERSE}
        for future in as_completed(futures, timeout=120):
            ticker = futures[future]
            try:
                res = future.result(timeout=25)
                if res is not None:
                    results.append(res)
            except Exception as e:
                logger.debug(f"Scanner future error {ticker}: {e}")

    bullish = sorted(
        [r for r in results if r['score'] > 0],
        key=lambda x: x['score'], reverse=True
    )[:20]
    bearish = sorted(
        [r for r in results if r['score'] < 0],
        key=lambda x: x['score']
    )[:20]

    result = {
        'timeframe':     timeframe,
        'generated_at':  datetime.now(timezone.utc).isoformat(),
        'scanned':       len(results),
        'universe_size': len(UNIVERSE),
        'bullish':       bullish,
        'bearish':       bearish,
    }
    _cache.set(cache_key, result)
    return result
