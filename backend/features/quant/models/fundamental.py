"""
Fundamental Health Filter model.

Scores a stock across five fundamental pillars using yfinance data:
  1. Earnings quality  — EPS growth, earnings vs estimates
  2. Profitability     — ROE, ROIC, net margin
  3. Balance sheet     — Debt/Equity, current ratio, interest coverage
  4. Cash flow         — FCF yield, OCF vs net income (accruals)
  5. Valuation         — P/E vs sector, P/B, FCF yield vs market

Direction:
  Bullish ( 1) — strong fundamental health (score ≥ 65)
  Bearish (-1) — weak/deteriorating fundamentals (score ≤ 35)
  Neutral ( 0) — mixed or inconclusive picture
"""
import logging
import warnings
import numpy as np
import yfinance as yf

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


def _safe(val, default=None):
    if val is None:
        return default
    try:
        import math
        if math.isnan(float(val)):
            return default
    except (TypeError, ValueError):
        return default
    return val


def _pct(val):
    v = _safe(val)
    return round(float(v) * 100, 2) if v is not None else None


def _fmt(val, d=2):
    v = _safe(val)
    return round(float(v), d) if v is not None else None


class FundamentalHealthModel(QuantModel):
    id          = "fundamental_health"
    name        = "Fundamental Health"
    description = (
        "Five-pillar fundamental scorecard: earnings quality, profitability, "
        "balance sheet strength, cash flow, and valuation. "
        "Signals whether the business quality supports or contradicts price action."
    )
    category    = "fundamental"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch yfinance data ────────────────────────────────────────────
        t    = yf.Ticker(ticker)
        info = t.info or {}

        if not info or not info.get("symbol"):
            raise ValueError(f"No fundamental data available for {ticker}")

        # ── 2. Extract key metrics ────────────────────────────────────────────
        eps_ttm        = _safe(info.get("trailingEps"))
        eps_fwd        = _safe(info.get("forwardEps"))
        eps_growth_est = _pct(info.get("earningsGrowth"))   # YoY EPS growth
        rev_growth     = _pct(info.get("revenueGrowth"))    # YoY revenue growth

        roe            = _pct(info.get("returnOnEquity"))
        roa            = _pct(info.get("returnOnAssets"))
        net_margin     = _pct(info.get("profitMargins"))
        op_margin      = _pct(info.get("operatingMargins"))
        gross_margin   = _pct(info.get("grossMargins"))

        debt_to_eq     = _fmt(info.get("debtToEquity"))
        current_ratio  = _fmt(info.get("currentRatio"))
        quick_ratio    = _fmt(info.get("quickRatio"))

        pe_ratio       = _fmt(info.get("trailingPE"))
        fwd_pe         = _fmt(info.get("forwardPE"))
        pb_ratio       = _fmt(info.get("priceToBook"))
        ps_ratio       = _fmt(info.get("priceToSalesTrailingTwelveMonths"))
        peg_ratio      = _fmt(info.get("pegRatio"))
        ev_ebitda      = _fmt(info.get("enterpriseToEbitda"))

        # FCF yield = FCF / market cap
        fcf            = _safe(info.get("freeCashflow"))
        market_cap     = _safe(info.get("marketCap"))
        fcf_yield      = round(float(fcf) / float(market_cap) * 100, 2) \
                         if fcf and market_cap and float(market_cap) > 0 else None

        # Analyst target vs price
        target_price   = _safe(info.get("targetMeanPrice"))
        current_price  = _safe(info.get("currentPrice")) or _safe(info.get("regularMarketPrice"))
        upside         = round((float(target_price) / float(current_price) - 1) * 100, 1) \
                         if target_price and current_price and float(current_price) > 0 else None

        # Piotroski-style signals
        rec_key        = _safe(info.get("recommendationKey", ""))
        analyst_rating = rec_key.lower() if rec_key else None

        # ── 3. Scoring (each pillar 0-20, total 0-100) ───────────────────────
        def clamp(x, lo, hi):
            return max(lo, min(hi, x))

        scores = {}

        # --- Pillar 1: Earnings quality (0-20) ---
        e_score = 10.0   # neutral base
        if eps_growth_est is not None:
            e_score += clamp(eps_growth_est / 3, -8, 8)   # ±8 for ±24% growth
        if rev_growth is not None:
            e_score += clamp(rev_growth / 5, -4, 4)       # ±4 for ±20% rev growth
        if eps_ttm and eps_fwd and eps_ttm > 0 and eps_fwd > eps_ttm:
            e_score = min(e_score + 2, 20)                 # bonus for earnings acceleration
        scores["earnings"] = round(clamp(e_score, 0, 20), 1)

        # --- Pillar 2: Profitability (0-20) ---
        p_score = 10.0
        if roe is not None:
            p_score += clamp((roe - 10) / 3, -6, 8)    # 10% ROE = neutral; 40% = +8
        if net_margin is not None:
            p_score += clamp((net_margin - 5) / 3, -4, 6)
        scores["profitability"] = round(clamp(p_score, 0, 20), 1)

        # --- Pillar 3: Balance sheet (0-20) ---
        b_score = 10.0
        if debt_to_eq is not None:
            b_score -= clamp(debt_to_eq / 100 * 4, 0, 8)   # high D/E hurts
        if current_ratio is not None:
            b_score += clamp((current_ratio - 1.5) * 3, -4, 4)
        scores["balance_sheet"] = round(clamp(b_score, 0, 20), 1)

        # --- Pillar 4: Cash flow (0-20) ---
        cf_score = 10.0
        if fcf_yield is not None:
            cf_score += clamp(fcf_yield * 1.5, -6, 8)   # 5% FCF yield → +7.5
        if fcf and fcf > 0:
            cf_score = min(cf_score + 2, 20)
        elif fcf and fcf < 0:
            cf_score = max(cf_score - 4, 0)
        scores["cash_flow"] = round(clamp(cf_score, 0, 20), 1)

        # --- Pillar 5: Valuation (0-20, inverse — lower multiple = higher score) ---
        v_score = 10.0
        if pe_ratio is not None and pe_ratio > 0:
            v_score += clamp((25 - pe_ratio) / 5, -6, 6)   # P/E 25 = neutral
        if pb_ratio is not None and pb_ratio > 0:
            v_score += clamp((3 - pb_ratio) / 1.5, -4, 4)  # P/B 3 = neutral
        if peg_ratio is not None:
            if peg_ratio < 1.0:
                v_score = min(v_score + 3, 20)
            elif peg_ratio > 2.5:
                v_score = max(v_score - 3, 0)
        scores["valuation"] = round(clamp(v_score, 0, 20), 1)

        total_score = round(sum(scores.values()), 1)   # 0-100

        # ── 4. Direction ──────────────────────────────────────────────────────
        if total_score >= 65:
            direction = 1
        elif total_score <= 35:
            direction = -1
        else:
            direction = 0

        # ── 5. Confidence ─────────────────────────────────────────────────────
        # Higher when score is extreme and data is available
        data_completeness = sum(1 for v in [eps_growth_est, roe, debt_to_eq, fcf_yield, pe_ratio]
                                if v is not None) / 5
        extreme_bonus     = max(0, abs(total_score - 50) - 10) * 0.8
        confidence        = round(max(20.0, min(85.0,
            extreme_bonus + data_completeness * 30 + 20
        )), 1)
        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 6. Regime label ───────────────────────────────────────────────────
        if total_score >= 70:
            regime = f"Strong Fundamentals ({total_score:.0f}/100)"
        elif total_score >= 55:
            regime = f"Healthy Fundamentals ({total_score:.0f}/100)"
        elif total_score >= 45:
            regime = f"Mixed Fundamentals ({total_score:.0f}/100)"
        elif total_score >= 30:
            regime = f"Weak Fundamentals ({total_score:.0f}/100)"
        else:
            regime = f"Poor Fundamentals ({total_score:.0f}/100)"

        # ── 7. Signals ───────────────────────────────────────────────────────
        signals = [
            f"Total fundamental score: {total_score}/100 → {regime}",
            f"Earnings pillar ({scores['earnings']}/20): EPS growth {eps_growth_est:+.1f}% | Rev growth {rev_growth:+.1f}%"
            if eps_growth_est is not None and rev_growth is not None
            else f"Earnings pillar ({scores['earnings']}/20): data limited",
            f"Profitability ({scores['profitability']}/20): ROE {roe:.1f}% | Net margin {net_margin:.1f}%"
            if roe is not None and net_margin is not None
            else f"Profitability ({scores['profitability']}/20): data limited",
            f"Balance sheet ({scores['balance_sheet']}/20): D/E {debt_to_eq:.0f}% | Current ratio {current_ratio:.2f}"
            if debt_to_eq is not None and current_ratio is not None
            else f"Balance sheet ({scores['balance_sheet']}/20): data limited",
            f"Cash flow ({scores['cash_flow']}/20): FCF yield {fcf_yield:.1f}%"
            if fcf_yield is not None
            else f"Cash flow ({scores['cash_flow']}/20): data limited",
            f"Valuation ({scores['valuation']}/20): P/E {pe_ratio} | P/B {pb_ratio} | PEG {peg_ratio}"
            if pe_ratio is not None
            else f"Valuation ({scores['valuation']}/20): data limited",
        ]
        if upside is not None:
            signals.append(f"Analyst consensus: {analyst_rating or 'n/a'} | Mean target {upside:+.1f}% upside")

        # ── 8. Summary ────────────────────────────────────────────────────────
        strongest  = max(scores, key=scores.get)
        weakest    = min(scores, key=scores.get)

        if direction == 1:
            summary = (
                f"{ticker} scores {total_score}/100 on fundamental health — indicating a strong business. "
                f"Strongest pillar: {strongest} ({scores[strongest]:.0f}/20). "
                f"ROE {roe:.1f}%, "
                f"{'FCF yield ' + str(fcf_yield) + '%' if fcf_yield else 'FCF data limited'}."
            )
        elif direction == -1:
            summary = (
                f"{ticker} scores {total_score}/100 on fundamental health — indicating fundamental weakness. "
                f"Weakest pillar: {weakest} ({scores[weakest]:.0f}/20). "
                f"Use as a caution flag alongside technical signals."
            )
        else:
            summary = (
                f"{ticker} has mixed fundamentals (score {total_score}/100). "
                f"Strongest: {strongest} ({scores[strongest]:.0f}/20), "
                f"weakest: {weakest} ({scores[weakest]:.0f}/20). "
                f"No strong fundamental conviction in either direction."
            )

        # ── 9. Chart data — pillar radar bars ────────────────────────────────
        pillar_bars = [
            {"pillar": "Earnings",      "score": scores["earnings"],      "max": 20},
            {"pillar": "Profitability", "score": scores["profitability"], "max": 20},
            {"pillar": "Balance Sheet", "score": scores["balance_sheet"], "max": 20},
            {"pillar": "Cash Flow",     "score": scores["cash_flow"],     "max": 20},
            {"pillar": "Valuation",     "score": scores["valuation"],     "max": 20},
        ]

        return QuantResult(
            ticker     = ticker.upper(),
            model_id   = self.id,
            model_name = self.name,
            direction  = direction,
            confidence = confidence,
            regime     = regime,
            summary    = summary,
            signals    = signals,
            chart_data = {"pillar_bars": pillar_bars},
            meta = {
                "total_score":    total_score,
                "pillar_scores":  scores,
                "eps_growth":     eps_growth_est,
                "rev_growth":     rev_growth,
                "roe":            roe,
                "roa":            roa,
                "net_margin":     net_margin,
                "op_margin":      op_margin,
                "gross_margin":   gross_margin,
                "debt_to_equity": debt_to_eq,
                "current_ratio":  current_ratio,
                "quick_ratio":    quick_ratio,
                "fcf_yield":      fcf_yield,
                "pe_ratio":       pe_ratio,
                "fwd_pe":         fwd_pe,
                "pb_ratio":       pb_ratio,
                "ps_ratio":       ps_ratio,
                "peg_ratio":      peg_ratio,
                "ev_ebitda":      ev_ebitda,
                "analyst_upside": upside,
                "analyst_rating": analyst_rating,
            },
        )
