"""
Options Flow model.

Analyses the options market for the stock to detect institutional/smart-money
positioning signals.

Two lenses:
  1. Unusual activity — high volume/OI contracts, large premium flows
  2. IV skew — put/call IV spread signals fear (bearish) or complacency (bullish)

Direction:
  Bullish ( 1) — net unusual flow is call-dominated, put skew is low
  Bearish (-1) — net unusual flow is put-dominated, put skew is elevated
  Neutral ( 0) — balanced or insufficient data

Confidence scales with the volume of unusual activity and skew magnitude.
"""
import logging
import warnings

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


class OptionsFlowModel(QuantModel):
    id          = "options_flow"
    name        = "Options Flow"
    description = (
        "Detects unusual options activity (high vol/OI, large premium) and "
        "IV skew. Signals institutional directional bets in calls vs puts."
    )
    category    = "options"

    def analyze(self, ticker: str) -> QuantResult:
        # ── 1. Fetch unusual activity ─────────────────────────────────────────
        try:
            from features.options.analyzers.unusual import get_unusual_activity
            unusual_data = get_unusual_activity(ticker.upper(), max_expirations=6, min_score=0.20)
        except Exception as e:
            raise ValueError(f"Options unusual activity fetch failed for {ticker}: {e}")

        contracts = unusual_data.get("contracts", [])

        # ── 2. Fetch IV skew ──────────────────────────────────────────────────
        skew_data = {}
        try:
            from features.options.analyzers.skew import get_skew
            skew_data = get_skew(ticker.upper(), max_expirations=4)
        except Exception as e:
            logger.warning(f"Skew fetch failed for {ticker}: {e}")

        # ── 3. Parse unusual flow ─────────────────────────────────────────────
        if not contracts:
            # No unusual activity — neutral with low confidence
            return QuantResult(
                ticker     = ticker.upper(),
                model_id   = self.id,
                model_name = self.name,
                direction  = 0,
                confidence = 20.0,
                regime     = "No Unusual Activity",
                summary    = (
                    f"No unusual options activity detected for {ticker}. "
                    "Options flow is within normal ranges — no institutional signal."
                ),
                signals    = ["No contracts met the unusual activity threshold"],
                chart_data = {"flow_bars": [], "skew_bars": []},
                meta       = {"contract_count": 0, "call_premium": 0, "put_premium": 0},
            )

        call_contracts = [c for c in contracts if c.get("type") == "call"]
        put_contracts  = [c for c in contracts if c.get("type") == "put"]

        call_premium  = sum(c.get("premium_value", 0) for c in call_contracts)
        put_premium   = sum(c.get("premium_value", 0) for c in put_contracts)
        total_premium = call_premium + put_premium

        call_vol = sum(c.get("volume", 0) for c in call_contracts)
        put_vol  = sum(c.get("volume", 0) for c in put_contracts)

        # Call/put premium ratio (>1 = call dominant = bullish lean)
        premium_ratio = round(call_premium / put_premium, 2) if put_premium > 0 else 5.0
        vol_ratio     = round(call_vol / put_vol, 2) if put_vol > 0 else 5.0

        # Count directional bets
        bull_count = sum(1 for c in contracts if c.get("sentiment") == "bullish")
        bear_count = sum(1 for c in contracts if c.get("sentiment") == "bearish")
        total_count = len(contracts)

        # ── 4. Parse IV skew ──────────────────────────────────────────────────
        skew_value = None
        skew_label = "n/a"
        avg_skew   = None
        skew_exps  = skew_data.get("expirations", [])
        if skew_exps:
            all_skews = [e.get("put_call_skew") for e in skew_exps if e.get("put_call_skew") is not None]
            if all_skews:
                avg_skew = round(sum(all_skews) / len(all_skews), 3)
                if avg_skew > 0.05:
                    skew_label = f"Put skew elevated ({avg_skew:+.3f}) — fear/hedging"
                elif avg_skew < -0.05:
                    skew_label = f"Call skew elevated ({avg_skew:+.3f}) — demand for upside"
                else:
                    skew_label = f"Skew neutral ({avg_skew:+.3f})"

        # ── 5. Direction ──────────────────────────────────────────────────────
        # Score from -1 to +1 using bull/bear contract count + premium ratio
        flow_score   = (bull_count - bear_count) / total_count if total_count > 0 else 0
        skew_penalty = 0.0
        if avg_skew is not None:
            skew_penalty = -min(avg_skew * 3, 0.5)   # high put skew subtracts from score

        composite = flow_score + skew_penalty

        if composite > 0.2:
            direction = 1
        elif composite < -0.2:
            direction = -1
        else:
            direction = 0

        # ── 6. Confidence ─────────────────────────────────────────────────────
        activity_conf = min(total_count / 10, 1.0) * 40   # up to 40 for 10+ contracts
        magnitude_conf = min(abs(composite), 1.0) * 30    # up to 30 from composite
        skew_conf      = min(abs(avg_skew or 0) / 0.1, 1.0) * 20  # up to 20 from skew

        confidence = round(max(15.0, min(82.0, activity_conf + magnitude_conf + skew_conf)), 1)
        if direction == 0:
            confidence = min(confidence, 40.0)

        # ── 7. Regime label ───────────────────────────────────────────────────
        if direction == 1:
            regime = f"Bullish Flow — {bull_count}/{total_count} contracts bullish"
        elif direction == -1:
            regime = f"Bearish Flow — {bear_count}/{total_count} contracts bearish"
        else:
            regime = f"Mixed Options Flow ({total_count} unusual contracts)"

        # ── 8. Signals ───────────────────────────────────────────────────────
        def _fmt_prem(v):
            if v >= 1_000_000:
                return f"${v/1_000_000:.1f}M"
            return f"${v/1_000:.0f}K"

        signals = [
            f"Unusual contracts: {total_count} ({bull_count} bullish / {bear_count} bearish)",
            f"Total premium: {_fmt_prem(total_premium)} — Calls: {_fmt_prem(call_premium)} / Puts: {_fmt_prem(put_premium)}",
            f"Call/Put premium ratio: {premium_ratio:.2f}  |  Vol ratio: {vol_ratio:.2f}",
            f"IV skew: {skew_label}",
            f"Composite flow score: {composite:+.2f}",
        ]

        # Surface top 3 contracts by premium
        top_contracts = sorted(contracts, key=lambda c: c.get("premium_value", 0), reverse=True)[:3]
        for c in top_contracts:
            signals.append(
                f"{c['type'].upper()} {c['strike']} {c.get('expiration_label','?')} — "
                f"Vol {c.get('volume',0):,} / OI {c.get('oi',0):,} — "
                f"Premium {_fmt_prem(c.get('premium_value',0))} — {c.get('sentiment','?').upper()}"
            )

        # ── 9. Summary ────────────────────────────────────────────────────────
        if direction == 1:
            summary = (
                f"{ticker} options flow is bullish: {bull_count}/{total_count} unusual contracts "
                f"are call-sided with {_fmt_prem(call_premium)} in call premium vs {_fmt_prem(put_premium)} puts. "
                f"{skew_label}."
            )
        elif direction == -1:
            summary = (
                f"{ticker} options flow is bearish: {bear_count}/{total_count} unusual contracts "
                f"are put-sided with {_fmt_prem(put_premium)} in put premium vs {_fmt_prem(call_premium)} calls. "
                f"{skew_label}."
            )
        else:
            summary = (
                f"{ticker} options flow is mixed — {total_count} unusual contracts with "
                f"{_fmt_prem(call_premium)} calls vs {_fmt_prem(put_premium)} puts. "
                f"No dominant directional bias. {skew_label}."
            )

        # ── 10. Chart data ────────────────────────────────────────────────────
        flow_bars = [
            {
                "label":     f"{c['type'].upper()} {c['strike']} {c.get('expiration_label','?')}",
                "premium":   c.get("premium_value", 0),
                "type":      c.get("type", "call"),
                "sentiment": c.get("sentiment", "neutral"),
                "score":     c.get("score", 0),
            }
            for c in sorted(contracts, key=lambda x: x.get("premium_value", 0), reverse=True)[:10]
        ]

        skew_bars = []
        for exp in skew_exps[:6]:
            skew_bars.append({
                "expiration": exp.get("expiration", ""),
                "dte":        exp.get("dte", 0),
                "skew":       exp.get("put_call_skew", 0),
            })

        return QuantResult(
            ticker     = ticker.upper(),
            model_id   = self.id,
            model_name = self.name,
            direction  = direction,
            confidence = confidence,
            regime     = regime,
            summary    = summary,
            signals    = signals,
            chart_data = {
                "flow_bars":  flow_bars,
                "skew_bars":  skew_bars,
            },
            meta = {
                "contract_count":    total_count,
                "bull_count":        bull_count,
                "bear_count":        bear_count,
                "call_premium":      call_premium,
                "put_premium":       put_premium,
                "total_premium":     total_premium,
                "premium_ratio":     premium_ratio,
                "vol_ratio":         vol_ratio,
                "avg_skew":          avg_skew,
                "composite_score":   round(composite, 3),
            },
        )
