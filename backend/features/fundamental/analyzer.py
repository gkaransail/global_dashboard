"""
Fundamental analyzer — fetches valuation, growth, and quality metrics for a ticker.
Uses yfinance directly for financial statement data.
"""
import math
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Any
import yfinance as yf
import pandas as pd
from core import cache as _cache

logger = logging.getLogger(__name__)

CACHE_TTL = 3600          # 1 hour — financial data is slow to fetch
SCREENER_TTL = 1800       # 30 min for screener

SCREENER_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "BAC",
    "GS", "AMD", "NFLX", "CRM", "ORCL", "INTC", "BRK-B", "JNJ", "PFE",
    "UNH", "XOM", "CVX", "WMT", "HD", "MCD", "KO", "PEP", "DIS", "V",
    "MA", "PYPL", "ADBE", "CSCO", "QCOM", "TXN", "AVGO", "MU", "IBM",
    "BA", "CAT", "GE", "F", "GM", "T", "VZ", "CMCSA", "AMGN",
    "GILD", "LLY", "BMY", "ABT", "NOW",
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe(val: Any, default=None) -> Any:
    """Return val if it's not None/NaN, otherwise default."""
    if val is None:
        return default
    try:
        if pd.isna(val):
            return default
    except (TypeError, ValueError):
        pass
    return val


def _pct(val: Any) -> Optional[float]:
    """Convert a ratio to percentage, handle None/NaN."""
    v = _safe(val)
    if v is None:
        return None
    try:
        return round(float(v) * 100, 2)
    except (TypeError, ValueError):
        return None


def _fmt(val: Any, decimals: int = 2) -> Optional[float]:
    """Safely round a value to N decimals."""
    v = _safe(val)
    if v is None:
        return None
    try:
        return round(float(v), decimals)
    except (TypeError, ValueError):
        return None


def _get_row(df: pd.DataFrame, *labels: str) -> Optional[pd.Series]:
    """Try multiple label variants to retrieve a row from a DataFrame."""
    if df is None or df.empty:
        return None
    for label in labels:
        if label in df.index:
            return df.loc[label]
    # Case-insensitive fallback
    idx_lower = {str(i).lower(): i for i in df.index}
    for label in labels:
        key = idx_lower.get(label.lower())
        if key is not None:
            return df.loc[key]
    return None


def _latest(series: Optional[pd.Series]) -> Optional[float]:
    """Return the most-recent non-NaN value from a series (columns = years)."""
    if series is None:
        return None
    vals = series.dropna()
    if vals.empty:
        return None
    return float(vals.iloc[0])


def _two_years(series: Optional[pd.Series]) -> tuple[Optional[float], Optional[float]]:
    """Return (latest, prior_year) values from a financial time series."""
    if series is None:
        return None, None
    vals = series.dropna()
    curr = float(vals.iloc[0]) if len(vals) > 0 else None
    prior = float(vals.iloc[1]) if len(vals) > 1 else None
    return curr, prior


def _yoy_growth(curr: Optional[float], prior: Optional[float]) -> Optional[float]:
    if curr is None or prior is None or prior == 0:
        return None
    return round(((curr - prior) / abs(prior)) * 100, 2)


def _cagr(curr: Optional[float], base: Optional[float], years: int) -> Optional[float]:
    if curr is None or base is None or base <= 0 or years <= 0:
        return None
    try:
        return round(((curr / base) ** (1 / years) - 1) * 100, 2)
    except (ZeroDivisionError, ValueError):
        return None


# ─── Valuation ────────────────────────────────────────────────────────────────

def get_valuation(ticker: str) -> dict:
    cache_key = f"fundamental_valuation_{ticker}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        cashflow = t.cashflow

        pe = _safe(info.get("trailingPE")) or _safe(info.get("forwardPE"))
        pb = _safe(info.get("priceToBook"))
        ps = _safe(info.get("priceToSalesTrailingTwelveMonths"))
        ev_ebitda = _safe(info.get("enterpriseToEbitda"))
        market_cap = _safe(info.get("marketCap"))
        enterprise_value = _safe(info.get("enterpriseValue"))
        current_price = _safe(info.get("currentPrice")) or _safe(info.get("regularMarketPrice"))

        # Graham Number: sqrt(22.5 × EPS × BVPS)
        graham_number = None
        try:
            eps = _safe(info.get("trailingEps")) or _safe(info.get("forwardEps"))
            bvps = _safe(info.get("bookValue"))
            if eps is not None and bvps is not None and eps > 0 and bvps > 0:
                graham_number = round(math.sqrt(22.5 * float(eps) * float(bvps)), 2)
        except Exception:
            pass

        # Simple 5-year DCF estimate
        dcf_estimate = None
        dcf_range_low = None
        dcf_range_high = None
        try:
            # Get FCF from cash flow statement
            fcf_row = _get_row(cashflow,
                "Free Cash Flow", "FreeCashFlow",
                "Capital Expenditures",  # fallback: will compute below
            )

            # Prefer direct FCF; otherwise compute from Operating CF - Capex
            fcf = None
            ocf_row = _get_row(cashflow, "Operating Cash Flow", "Cash Flow From Operations",
                                "Net Cash Provided By Operating Activities")
            capex_row = _get_row(cashflow, "Capital Expenditure", "Capital Expenditures",
                                  "Purchase Of Ppe", "Purchases Of Property Plant And Equipment")

            if fcf_row is not None:
                fcf = _latest(fcf_row)
            if fcf is None and ocf_row is not None and capex_row is not None:
                ocf = _latest(ocf_row)
                capex = _latest(capex_row)
                if ocf is not None and capex is not None:
                    fcf = ocf - abs(capex)

            revenue_growth = _safe(info.get("revenueGrowth"))
            g = float(revenue_growth) if revenue_growth is not None else 0.05
            g = max(-0.2, min(g, 0.25))   # clamp to reasonable range
            g_terminal = 0.03
            discount_rate = 0.10
            shares = _safe(info.get("sharesOutstanding"))

            if fcf and fcf > 0 and shares and shares > 0:
                # Sum of PV of FCFs over 5 years + terminal value
                pv_sum = 0.0
                cf = float(fcf)
                for yr in range(1, 6):
                    cf = cf * (1 + g)
                    pv_sum += cf / ((1 + discount_rate) ** yr)
                # Terminal value (Gordon Growth)
                terminal_cf = cf * (1 + g_terminal)
                terminal_value = terminal_cf / (discount_rate - g_terminal)
                terminal_pv = terminal_value / ((1 + discount_rate) ** 5)
                total_value = pv_sum + terminal_pv
                dcf_per_share = round(total_value / float(shares), 2)
                dcf_estimate = dcf_per_share
                dcf_range_low = round(dcf_per_share * 0.80, 2)
                dcf_range_high = round(dcf_per_share * 1.20, 2)
        except Exception as e:
            logger.debug(f"DCF failed for {ticker}: {e}")

        # Compute Graham discount/premium vs current price
        graham_vs_price = None
        if graham_number and current_price and current_price > 0:
            pct_diff = round(((current_price - graham_number) / graham_number) * 100, 1)
            graham_vs_price = pct_diff  # positive = above Graham, negative = below

        description = info.get("longBusinessSummary", "")
        if description:
            description = description[:300]

        result = {
            "ticker": ticker.upper(),
            "name": _safe(info.get("shortName") or info.get("longName"), ticker.upper()),
            "sector": _safe(info.get("sector")),
            "industry": _safe(info.get("industry")),
            "description": description or None,
            "current_price": _fmt(current_price),
            "market_cap": market_cap,
            "enterprise_value": enterprise_value,
            "pe_ratio": _fmt(pe),
            "pb_ratio": _fmt(pb),
            "ps_ratio": _fmt(ps),
            "ev_ebitda": _fmt(ev_ebitda),
            "graham_number": graham_number,
            "graham_vs_price_pct": graham_vs_price,
            "dcf_estimate": dcf_estimate,
            "dcf_range_low": dcf_range_low,
            "dcf_range_high": dcf_range_high,
            "dcf_note": "Simple 5-year DCF — rough estimate only. Uses trailing FCF, revenue growth rate, 10% discount, 3% terminal.",
        }

        _cache.set(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"Valuation failed for {ticker}: {e}")
        return {"ticker": ticker.upper(), "error": str(e)}


# ─── Growth ───────────────────────────────────────────────────────────────────

def get_growth(ticker: str) -> dict:
    cache_key = f"fundamental_growth_{ticker}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        financials = t.financials  # annual income statement (columns = years, most recent first)

        # Revenue
        rev_row = _get_row(financials, "Total Revenue", "Revenue", "TotalRevenue")
        rev_curr, rev_prior = _two_years(rev_row)
        rev_4yr = None
        if rev_row is not None:
            vals = rev_row.dropna()
            if len(vals) >= 4:
                rev_4yr = float(vals.iloc[3])
        rev_yoy = _yoy_growth(rev_curr, rev_prior)
        rev_3y_cagr = _cagr(rev_curr, rev_4yr, 3) if rev_4yr else None

        # Build revenue history for chart (last 4 years)
        revenue_history = []
        if rev_row is not None:
            vals = rev_row.dropna()
            for i, (col, val) in enumerate(vals.items()):
                if i >= 4:
                    break
                try:
                    year = str(col)[:4]
                    revenue_history.append({"year": year, "revenue": float(val)})
                except Exception:
                    pass
            revenue_history.reverse()  # oldest first

        # Earnings (Net Income)
        ni_row = _get_row(financials, "Net Income", "Net Income Common Stockholders",
                           "NetIncome", "Net Income Applicable To Common Shares")
        ni_curr, ni_prior = _two_years(ni_row)
        earnings_yoy = _yoy_growth(ni_curr, ni_prior)

        # Gross Margin
        gross_profit_row = _get_row(financials, "Gross Profit", "GrossProfit")
        gp_curr = _latest(gross_profit_row)
        gross_margin = None
        if gp_curr is not None and rev_curr is not None and rev_curr != 0:
            gross_margin = round((gp_curr / rev_curr) * 100, 2)

        # Margins from info
        operating_margin = _pct(info.get("operatingMargins"))
        net_margin = _pct(info.get("profitMargins"))

        # FCF Yield
        fcf_yield = None
        try:
            cashflow = t.cashflow
            ocf_row = _get_row(cashflow, "Operating Cash Flow", "Cash Flow From Operations",
                                 "Net Cash Provided By Operating Activities")
            capex_row = _get_row(cashflow, "Capital Expenditure", "Capital Expenditures",
                                   "Purchase Of Ppe", "Purchases Of Property Plant And Equipment")
            fcf_direct = _get_row(cashflow, "Free Cash Flow", "FreeCashFlow")

            fcf = None
            if fcf_direct is not None:
                fcf = _latest(fcf_direct)
            if fcf is None and ocf_row is not None and capex_row is not None:
                ocf = _latest(ocf_row)
                capex = _latest(capex_row)
                if ocf is not None and capex is not None:
                    fcf = ocf - abs(capex)

            mktcap = _safe(info.get("marketCap"))
            if fcf is not None and mktcap and mktcap > 0:
                fcf_yield = round((float(fcf) / float(mktcap)) * 100, 2)
        except Exception as e:
            logger.debug(f"FCF yield failed for {ticker}: {e}")

        # Growth score (0–100)
        score_components = []

        def score_metric(val, thresholds: list[tuple[float, float]]) -> float:
            """Map val to a 0-100 score using linear thresholds."""
            if val is None:
                return 50.0  # neutral when unknown
            for threshold, pts in thresholds:
                if val >= threshold:
                    return pts
            return 0.0

        score_components.append(score_metric(rev_yoy, [(20, 100), (10, 80), (5, 60), (0, 40), (-5, 20)]))
        score_components.append(score_metric(rev_3y_cagr, [(20, 100), (10, 80), (5, 60), (0, 40)]))
        score_components.append(score_metric(earnings_yoy, [(25, 100), (10, 80), (0, 60), (-10, 30)]))
        score_components.append(score_metric(gross_margin, [(60, 100), (40, 80), (25, 60), (10, 40)]))
        score_components.append(score_metric(net_margin, [(20, 100), (10, 80), (5, 60), (0, 40)]))
        score_components.append(score_metric(fcf_yield, [(5, 100), (2, 70), (0, 50)]))

        growth_score = round(sum(score_components) / len(score_components))

        result = {
            "ticker": ticker.upper(),
            "revenue_growth_yoy": rev_yoy,
            "revenue_growth_3y_cagr": rev_3y_cagr,
            "earnings_growth_yoy": earnings_yoy,
            "gross_margin": gross_margin,
            "operating_margin": operating_margin,
            "net_margin": net_margin,
            "fcf_yield": fcf_yield,
            "growth_score": growth_score,
            "revenue_history": revenue_history,
        }

        _cache.set(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"Growth failed for {ticker}: {e}")
        return {"ticker": ticker.upper(), "error": str(e)}


# ─── Quality ──────────────────────────────────────────────────────────────────

def get_quality(ticker: str) -> dict:
    cache_key = f"fundamental_quality_{ticker}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        financials = t.financials
        balance_sheet = t.balance_sheet
        cashflow = t.cashflow

        roe = _pct(info.get("returnOnEquity"))
        roa = _pct(info.get("returnOnAssets"))
        debt_to_equity = _fmt(info.get("debtToEquity"))
        current_ratio = _fmt(info.get("currentRatio"))
        quick_ratio = _fmt(info.get("quickRatio"))

        # ROIC: (Net Income - Dividends) / (Total Equity + Long-Term Debt)
        roic = None
        try:
            ni_row = _get_row(financials, "Net Income", "Net Income Common Stockholders", "NetIncome")
            ni = _latest(ni_row)

            # Dividends paid
            div_row = _get_row(cashflow, "Cash Dividends Paid", "Dividends Paid",
                                "Payment Of Dividends", "Common Stock Dividend Paid")
            div = _latest(div_row)
            div = abs(float(div)) if div is not None else 0

            # Total equity
            eq_row = _get_row(balance_sheet,
                "Total Stockholders Equity", "Total Equity", "Common Stock Equity",
                "Stockholders Equity", "Total Equity Gross Minority Interest")
            eq = _latest(eq_row)

            # Long-term debt
            ltd_row = _get_row(balance_sheet,
                "Long Term Debt", "LongTermDebt",
                "Long-Term Debt", "Long Term Debt And Capital Lease Obligation")
            ltd = _latest(ltd_row)
            ltd = float(ltd) if ltd is not None else 0

            if ni is not None and eq is not None and (float(eq) + ltd) != 0:
                roic = round(((float(ni) - div) / (float(eq) + ltd)) * 100, 2)
        except Exception as e:
            logger.debug(f"ROIC failed for {ticker}: {e}")

        # Interest Coverage: EBIT / Interest Expense
        interest_coverage = None
        try:
            ebit_row = _get_row(financials, "EBIT", "Ebit",
                                  "Earnings Before Interest And Taxes")
            ebit = _latest(ebit_row)

            int_row = _get_row(financials, "Interest Expense", "InterestExpense",
                                "Interest Expense Non Operating", "Net Interest Income")
            int_exp = _latest(int_row)

            if ebit is not None and int_exp is not None and int_exp != 0:
                interest_coverage = round(float(ebit) / abs(float(int_exp)), 2)
        except Exception as e:
            logger.debug(f"Interest coverage failed for {ticker}: {e}")

        # ── Altman Z-Score ────────────────────────────────────────────────────
        altman_z = None
        altman_zone = None
        try:
            # Working Capital = Current Assets - Current Liabilities
            ca_row = _get_row(balance_sheet, "Current Assets", "Total Current Assets",
                               "CurrentAssets")
            cl_row = _get_row(balance_sheet, "Current Liabilities", "Total Current Liabilities",
                               "CurrentLiabilities")
            ca = _latest(ca_row)
            cl = _latest(cl_row)
            wc = (float(ca) - float(cl)) if ca is not None and cl is not None else None

            # Total Assets
            ta_row = _get_row(balance_sheet, "Total Assets", "TotalAssets")
            ta = _latest(ta_row)

            # Retained Earnings
            re_row = _get_row(balance_sheet, "Retained Earnings", "RetainedEarnings",
                               "Retained Earnings Accumulated Deficit")
            retained = _latest(re_row)

            # EBIT
            ebit_row = _get_row(financials, "EBIT", "Ebit",
                                  "Earnings Before Interest And Taxes")
            ebit_az = _latest(ebit_row)

            # Market Value of Equity
            mve = _safe(info.get("marketCap"))

            # Total Liabilities
            tl_row = _get_row(balance_sheet, "Total Liabilities Net Minority Interest",
                               "Total Liabilities", "TotalLiabilities",
                               "Total Liab", "Total Liabilities And Minority Interest")
            tl = _latest(tl_row)

            # Sales = Total Revenue
            rev_row2 = _get_row(financials, "Total Revenue", "Revenue", "TotalRevenue")
            sales = _latest(rev_row2)

            if all(v is not None for v in [wc, ta, retained, ebit_az, mve, tl, sales]) and float(ta) != 0:
                ta_f = float(ta)
                X1 = float(wc) / ta_f
                X2 = float(retained) / ta_f
                X3 = float(ebit_az) / ta_f
                X4 = float(mve) / float(tl) if float(tl) != 0 else 0
                X5 = float(sales) / ta_f
                altman_z = round(1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5, 2)
                if altman_z > 2.99:
                    altman_zone = "Safe"
                elif altman_z >= 1.81:
                    altman_zone = "Grey Zone"
                else:
                    altman_zone = "Distress"
        except Exception as e:
            logger.debug(f"Altman Z failed for {ticker}: {e}")

        # ── Piotroski F-Score ─────────────────────────────────────────────────
        piotroski_score = None
        piotroski_detail = {}
        try:
            # --- Profitability (4 pts) ---
            # F1: Positive Net Income
            ni_row2 = _get_row(financials, "Net Income", "Net Income Common Stockholders", "NetIncome")
            ni_curr = _latest(ni_row2)
            f1 = 1 if (ni_curr is not None and ni_curr > 0) else 0
            piotroski_detail["positive_net_income"] = bool(f1)

            # F2: Positive ROA
            roa_raw = _safe(info.get("returnOnAssets"))
            f2 = 1 if (roa_raw is not None and float(roa_raw) > 0) else 0
            piotroski_detail["positive_roa"] = bool(f2)

            # F3: Positive Operating Cash Flow
            ocf_row = _get_row(cashflow, "Operating Cash Flow", "Cash Flow From Operations",
                                 "Net Cash Provided By Operating Activities")
            ocf = _latest(ocf_row)
            f3 = 1 if (ocf is not None and ocf > 0) else 0
            piotroski_detail["positive_ocf"] = bool(f3)

            # F4: OCF > Net Income (accruals)
            f4 = 1 if (ocf is not None and ni_curr is not None and ocf > ni_curr) else 0
            piotroski_detail["ocf_gt_net_income"] = bool(f4)

            # --- Leverage/Liquidity (3 pts) ---
            # F5: Decreasing long-term debt ratio
            ta_f2 = float(ta) if ta is not None else None
            ltd_row2 = _get_row(balance_sheet, "Long Term Debt", "LongTermDebt",
                                  "Long-Term Debt", "Long Term Debt And Capital Lease Obligation")
            ltd_series = ltd_row2 if ltd_row2 is not None else None
            ltd_curr2, ltd_prior2 = _two_years(ltd_series)
            ta_row2 = _get_row(balance_sheet, "Total Assets", "TotalAssets")
            ta_series = ta_row2 if ta_row2 is not None else None
            ta_curr2, ta_prior2 = _two_years(ta_series)

            f5 = 0
            if (ltd_curr2 is not None and ltd_prior2 is not None
                    and ta_curr2 is not None and ta_prior2 is not None
                    and ta_curr2 > 0 and ta_prior2 > 0):
                leverage_curr = ltd_curr2 / ta_curr2
                leverage_prior = ltd_prior2 / ta_prior2
                f5 = 1 if leverage_curr < leverage_prior else 0
            piotroski_detail["decreasing_leverage"] = bool(f5)

            # F6: Improving current ratio
            curr_ratio_raw = _safe(info.get("currentRatio"))
            # We'd need prior period current ratio; use yoy from balance sheet
            ca_series = _get_row(balance_sheet, "Current Assets", "Total Current Assets", "CurrentAssets")
            cl_series = _get_row(balance_sheet, "Current Liabilities", "Total Current Liabilities", "CurrentLiabilities")
            ca_curr2, ca_prior2 = _two_years(ca_series)
            cl_curr2, cl_prior2 = _two_years(cl_series)

            f6 = 0
            if all(v is not None and v != 0 for v in [ca_curr2, cl_curr2, ca_prior2, cl_prior2]):
                cr_curr2 = ca_curr2 / cl_curr2
                cr_prior2 = ca_prior2 / cl_prior2
                f6 = 1 if cr_curr2 > cr_prior2 else 0
            piotroski_detail["improving_current_ratio"] = bool(f6)

            # F7: No new share dilution
            shares_row = _get_row(balance_sheet,
                "Common Stock", "Ordinary Shares Number",
                "Share Issued", "Shares Issued")
            sh_curr, sh_prior = _two_years(shares_row)
            # Fallback: use sharesOutstanding from info
            f7 = 1  # default to pass if can't determine
            if sh_curr is not None and sh_prior is not None and sh_prior > 0:
                f7 = 1 if sh_curr <= sh_prior * 1.02 else 0  # allow 2% tolerance
            piotroski_detail["no_share_dilution"] = bool(f7)

            # --- Operating Efficiency (2 pts) ---
            # F8: Improving gross margin
            gp_row = _get_row(financials, "Gross Profit", "GrossProfit")
            rev_row3 = _get_row(financials, "Total Revenue", "Revenue", "TotalRevenue")
            gp_curr2, gp_prior2 = _two_years(gp_row)
            rev_curr2, rev_prior2 = _two_years(rev_row3)

            f8 = 0
            if (gp_curr2 is not None and rev_curr2 is not None and rev_curr2 > 0
                    and gp_prior2 is not None and rev_prior2 is not None and rev_prior2 > 0):
                gm_curr = gp_curr2 / rev_curr2
                gm_prior = gp_prior2 / rev_prior2
                f8 = 1 if gm_curr > gm_prior else 0
            piotroski_detail["improving_gross_margin"] = bool(f8)

            # F9: Improving asset turnover
            f9 = 0
            if (sales is not None and ta is not None and ta > 0
                    and rev_prior2 is not None and ta_prior2 is not None and ta_prior2 > 0):
                at_curr = float(sales) / float(ta)
                at_prior = float(rev_prior2) / float(ta_prior2)
                f9 = 1 if at_curr > at_prior else 0
            piotroski_detail["improving_asset_turnover"] = bool(f9)

            piotroski_score = f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8 + f9

        except Exception as e:
            logger.debug(f"Piotroski failed for {ticker}: {e}")

        # Quality score (0–100)
        def qs(val, thresholds):
            if val is None:
                return 50.0
            for threshold, pts in thresholds:
                if val >= threshold:
                    return pts
            return 0.0

        score_parts = [
            qs(roe, [(20, 100), (15, 80), (10, 60), (5, 40), (0, 20)]),
            qs(roic, [(15, 100), (10, 80), (5, 60), (0, 40)]),
            qs(current_ratio, [(2, 100), (1.5, 80), (1, 60), (0.75, 30)]),
            qs(interest_coverage, [(5, 100), (3, 80), (2, 60), (1, 30)]),
        ]

        if altman_z is not None:
            if altman_z > 2.99:
                score_parts.append(100.0)
            elif altman_z >= 1.81:
                score_parts.append(50.0)
            else:
                score_parts.append(10.0)

        if piotroski_score is not None:
            score_parts.append(round((piotroski_score / 9) * 100))

        if debt_to_equity is not None:
            if debt_to_equity < 50:
                score_parts.append(100.0)
            elif debt_to_equity < 100:
                score_parts.append(70.0)
            elif debt_to_equity < 200:
                score_parts.append(40.0)
            else:
                score_parts.append(10.0)

        quality_score = round(sum(score_parts) / len(score_parts)) if score_parts else 50

        result = {
            "ticker": ticker.upper(),
            "roe": roe,
            "roa": roa,
            "roic": roic,
            "debt_to_equity": debt_to_equity,
            "current_ratio": current_ratio,
            "quick_ratio": quick_ratio,
            "interest_coverage": interest_coverage,
            "altman_z_score": altman_z,
            "altman_zone": altman_zone,
            "piotroski_f_score": piotroski_score,
            "piotroski_detail": piotroski_detail,
            "quality_score": quality_score,
        }

        _cache.set(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"Quality failed for {ticker}: {e}")
        return {"ticker": ticker.upper(), "error": str(e)}


# ─── Overview (combined) ──────────────────────────────────────────────────────

def get_overview(ticker: str) -> dict:
    cache_key = f"fundamental_overview_{ticker}"
    cached = _cache.get(cache_key, ttl=CACHE_TTL)
    if cached:
        return cached

    valuation = get_valuation(ticker)
    growth = get_growth(ticker)
    quality = get_quality(ticker)

    result = {
        "ticker": ticker.upper(),
        "valuation": valuation,
        "growth": growth,
        "quality": quality,
    }

    _cache.set(cache_key, result)
    return result


# ─── Screener ─────────────────────────────────────────────────────────────────

def _screener_fetch_one(ticker: str) -> Optional[dict]:
    """Fetch minimal data for one ticker for the screener."""
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        pe = _safe(info.get("trailingPE")) or _safe(info.get("forwardPE"))
        roe = _pct(info.get("returnOnEquity"))
        mktcap = _safe(info.get("marketCap"))
        profitable = _safe(info.get("profitMargins")) is not None and float(_safe(info.get("profitMargins"), 0)) > 0

        # Quick growth/quality scores
        rev_growth = _safe(info.get("revenueGrowth"))
        rev_growth_pct = round(float(rev_growth) * 100, 1) if rev_growth is not None else None

        # Simple scores based on info only (fast)
        growth_score = 50
        quality_score = 50

        if rev_growth_pct is not None:
            if rev_growth_pct > 20:
                growth_score = 80
            elif rev_growth_pct > 10:
                growth_score = 65
            elif rev_growth_pct > 0:
                growth_score = 55
            else:
                growth_score = 35

        roe_raw = _safe(info.get("returnOnEquity"))
        if roe_raw is not None:
            roe_f = float(roe_raw) * 100
            if roe_f > 20:
                quality_score = 80
            elif roe_f > 10:
                quality_score = 65
            elif roe_f > 0:
                quality_score = 50
            else:
                quality_score = 25

        # Verdict
        verdict = "Neutral"
        if pe is not None and roe_raw is not None:
            roe_f = float(roe_raw) * 100
            pe_f = float(pe)
            if pe_f < 15 and roe_f > 15:
                verdict = "Strong Buy"
            elif pe_f < 20 and roe_f > 10:
                verdict = "Buy"
            elif pe_f > 30:
                verdict = "Expensive"
            elif roe_f < 5:
                verdict = "Weak"

        return {
            "ticker": ticker.upper(),
            "market_cap": mktcap,
            "pe_ratio": _fmt(pe),
            "roe": roe,
            "growth_score": growth_score,
            "quality_score": quality_score,
            "revenue_growth_pct": rev_growth_pct,
            "profitable": profitable,
            "verdict": verdict,
        }
    except Exception as e:
        logger.debug(f"Screener fetch failed for {ticker}: {e}")
        return None


def get_screener(
    min_pe: Optional[float] = None,
    max_pe: Optional[float] = None,
    min_roe: Optional[float] = None,
    profitable_only: bool = False,
    limit: int = 30,
) -> list[dict]:
    cache_key = f"fundamental_screener_{min_pe}_{max_pe}_{min_roe}_{profitable_only}"
    cached = _cache.get(cache_key, ttl=SCREENER_TTL)
    if cached:
        return cached[:limit]

    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_screener_fetch_one, t): t for t in SCREENER_UNIVERSE}
        for future in as_completed(futures):
            row = future.result()
            if row is None:
                continue

            # Apply filters
            pe = row.get("pe_ratio")
            roe = row.get("roe")
            profitable = row.get("profitable", False)

            if min_pe is not None and (pe is None or pe < min_pe):
                continue
            if max_pe is not None and (pe is None or pe > max_pe):
                continue
            if min_roe is not None and (roe is None or roe < min_roe):
                continue
            if profitable_only and not profitable:
                continue

            results.append(row)

    results.sort(key=lambda r: (r.get("quality_score", 0) + r.get("growth_score", 0)), reverse=True)
    _cache.set(cache_key, results)
    return results[:limit]
