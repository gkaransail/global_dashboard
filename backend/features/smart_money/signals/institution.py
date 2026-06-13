"""
Institutional signals: ownership % and recent accumulation/distribution trend.
Score range: -1.0 (distributing) to +1.0 (accumulating).
"""
import logging
import yfinance as yf

logger = logging.getLogger(__name__)


def score(ticker: str) -> dict:
    try:
        t = yf.Ticker(ticker)

        # --- Ownership level ---
        major = t.major_holders
        inst_pct = 0.0
        if major is not None and not major.empty:
            try:
                row = major[major.index == "institutionsPercentHeld"]
                if not row.empty:
                    inst_pct = float(row["Value"].iloc[0])
            except Exception:
                pass

        # --- Accumulation/distribution trend (top holders pctChange) ---
        holders = t.institutional_holders
        avg_change = 0.0
        top_holders = []

        if holders is not None and not holders.empty and "pctChange" in holders.columns:
            changes = holders["pctChange"].dropna()
            # Filter out extreme outliers (new positions show 1.0 or -1.0)
            filtered = changes[(changes > -0.5) & (changes < 0.5)]
            if not filtered.empty:
                avg_change = float(filtered.mean())

            for _, row in holders.head(5).iterrows():
                chg = row.get("pctChange", 0)
                top_holders.append({
                    "name": str(row.get("Holder", "")),
                    "pct_change": round(float(chg), 3) if chg else 0,
                })

        # --- Score ---
        # Ownership level gives a baseline (high ownership = institutional conviction)
        if inst_pct > 0.80:
            ownership_score = 0.3
        elif inst_pct > 0.60:
            ownership_score = 0.15
        elif inst_pct > 0.40:
            ownership_score = 0.0
        elif inst_pct > 0.20:
            ownership_score = -0.1
        else:
            ownership_score = -0.2

        # Trend score from recent pctChange
        if avg_change > 0.10:
            trend_score = 0.8
        elif avg_change > 0.04:
            trend_score = 0.5
        elif avg_change > 0.01:
            trend_score = 0.2
        elif avg_change < -0.10:
            trend_score = -0.8
        elif avg_change < -0.04:
            trend_score = -0.5
        elif avg_change < -0.01:
            trend_score = -0.2
        else:
            trend_score = 0.0

        composite = (trend_score * 0.75) + (ownership_score * 0.25)
        composite = max(-1.0, min(1.0, composite))

        reasons = []
        if avg_change > 0.03:
            reasons.append(f"Institutions adding (+{avg_change*100:.1f}% avg position change)")
        elif avg_change < -0.03:
            reasons.append(f"Institutions trimming ({avg_change*100:.1f}% avg position change)")
        reasons.append(f"{inst_pct*100:.0f}% institutionally held")

        return {
            "score": round(composite, 3),
            "inst_pct_held": round(inst_pct * 100, 1),
            "avg_position_change": round(avg_change * 100, 2),
            "top_holders": top_holders,
            "reasons": reasons,
        }
    except Exception as e:
        logger.debug(f"Institution signal failed for {ticker}: {e}")
        return _empty()


def _empty():
    return {"score": 0.0, "inst_pct_held": 0.0, "avg_position_change": 0.0,
            "top_holders": [], "reasons": []}
