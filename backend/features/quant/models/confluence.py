"""
Options × Order Flow Confluence Model.

Combines two orthogonal directional signals:
  1. Options chain positioning — PC_ATM ratio, GEX, max pain, squeeze detection
  2. Intraday order flow      — cumulative delta, VWAP, momentum, price/delta divergence

When both agree → high-conviction direction.
When they conflict → the model interprets WHY and forces neutral until resolved.

Conflict logic:
  - Put-heavy options + bullish flow  → likely institutional hedges on longs, not bearish bets
  - Call-heavy options + bearish flow → possible distribution or covered calls despite bullish options

Direction:
  Bullish  ( 1) — combined score > 0.15
  Bearish  (-1) — combined score < -0.15
  Neutral  ( 0) — signals conflict OR score is too weak to confirm
"""
import logging
import warnings

from features.quant.base import QuantModel, QuantResult

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


# ── Options scoring ────────────────────────────────────────────────────────────

def _options_score(analysis: dict) -> tuple[float, list[str]]:
    score   = 0.0
    bullets = []

    pc_atm    = analysis.get("pc_atm_ratio")
    pc_vol    = analysis.get("pc_vol_ratio")
    max_pain  = analysis.get("max_pain")
    spot      = analysis.get("spot_price", 0)
    gex       = analysis.get("gex") or {}
    squeeze   = analysis.get("squeeze_candidate", False)

    # 1. PC_ATM — near-money put/call OI ratio (cleanest near-term signal)
    if pc_atm is not None:
        if pc_atm < 0.60:
            score += 0.40
            bullets.append(f"PC_ATM {pc_atm:.2f}: heavy near-money call buying — strongly bullish positioning")
        elif pc_atm < 0.80:
            score += 0.25
            bullets.append(f"PC_ATM {pc_atm:.2f}: call-heavy near-money positioning (bullish)")
        elif pc_atm < 1.00:
            score += 0.10
            bullets.append(f"PC_ATM {pc_atm:.2f}: mild call lean near the money (slightly bullish)")
        elif pc_atm < 1.20:
            score -= 0.10
            bullets.append(f"PC_ATM {pc_atm:.2f}: mild put lean near the money (slightly bearish)")
        elif pc_atm < 1.50:
            score -= 0.25
            bullets.append(f"PC_ATM {pc_atm:.2f}: put-heavy near-money positioning (bearish)")
        else:
            score -= 0.40
            bullets.append(f"PC_ATM {pc_atm:.2f}: heavy near-money put buying — strongly bearish positioning")

    # 2. PC_VOL — today's live flow (more current, less weight)
    if pc_vol is not None:
        if pc_vol < 0.70:
            score += 0.15
            bullets.append(f"PC_Vol {pc_vol:.2f}: today's volume is call-dominated (bullish real-time flow)")
        elif pc_vol < 1.00:
            score += 0.05
            bullets.append(f"PC_Vol {pc_vol:.2f}: slight call volume lead today")
        elif pc_vol < 1.30:
            score -= 0.05
            bullets.append(f"PC_Vol {pc_vol:.2f}: slight put volume lead today")
        else:
            score -= 0.15
            bullets.append(f"PC_Vol {pc_vol:.2f}: today's volume is put-dominated (bearish real-time flow)")

    # 3. Max pain gravity — price gravitates toward max pain into expiry
    if max_pain and spot > 0:
        mp_pct = (max_pain - spot) / spot * 100
        if mp_pct > 1.0:
            score += 0.10
            bullets.append(f"Max pain ${max_pain} is {mp_pct:+.1f}% above spot — gravitational pull is UPWARD into expiry")
        elif mp_pct < -1.0:
            score -= 0.10
            bullets.append(f"Max pain ${max_pain} is {mp_pct:+.1f}% below spot — gravitational pull is DOWNWARD into expiry")
        else:
            bullets.append(f"Max pain ${max_pain} near spot ({mp_pct:+.1f}%) — no strong gravitational pull")

    # 4. GEX environment
    gex_env    = gex.get("environment", "positive")
    total_gex  = gex.get("total_gex_millions", 0) or 0
    max_gex_s  = gex.get("max_gex_strike")
    gex_flip   = gex.get("gex_flip_level")
    if gex_env == "negative" and abs(total_gex) > 0.5:
        amp = 0.08 * (1 if score >= 0 else -1)
        score += amp
        bullets.append(
            f"GEX ${total_gex:.1f}M (negative gamma) — MMs amplify moves, adding conviction to existing direction"
        )
        if gex_flip:
            bullets.append(f"GEX flip level ${gex_flip} — self-reinforcing breakdown below this strike")
    else:
        bullets.append(
            f"GEX ${total_gex:.1f}M (positive gamma) — MMs stabilize price, MM magnet near ${max_gex_s}"
        )

    # 5. Short-squeeze setup
    if squeeze:
        score += 0.15
        si  = analysis.get("short_pct_float") or 0
        dtc = analysis.get("days_to_cover")
        bullets.append(
            f"⚡ Squeeze candidate: {si}% short float"
            + (f", {dtc}d to cover" if dtc else "")
            + " + call-heavy positioning = short-squeeze risk"
        )

    return round(score, 3), bullets


# ── Order flow scoring ─────────────────────────────────────────────────────────

def _flow_score(ticker: str) -> tuple[float, list[str], dict]:
    from features.order_flow.router import _fetch, _enrich, _momentum_and_divergence

    score   = 0.0
    bullets = []

    try:
        df = _enrich(_fetch(ticker, "1d"))
    except Exception as e:
        return 0.0, [f"Order flow unavailable: {e}"], {}

    if df.empty or len(df) < 5:
        return 0.0, ["Insufficient intraday bars for order flow analysis"], {}

    total_vol  = int(df["Volume"].sum())
    buy_vol    = int(df["buy_vol"].sum())
    cum_delta  = int(df["cum_delta"].iloc[-1])
    spot       = float(df["Close"].iloc[-1])
    vwap       = float((df["Close"] * df["Volume"]).sum() / df["Volume"].sum()) if total_vol > 0 else spot
    buy_pct    = round(buy_vol / total_vol * 100) if total_vol > 0 else 50
    lp_count   = int(df["is_large_print"].sum())
    ab_count   = int(df["is_absorption"].sum())

    # 1. Cumulative delta
    if cum_delta > 0:
        score += 0.35
        bullets.append(f"Cum delta {cum_delta:+,} ({buy_pct}% buying) — net buying pressure on the tape")
    elif cum_delta < 0:
        score -= 0.35
        bullets.append(f"Cum delta {cum_delta:+,} ({buy_pct}% buying) — net selling pressure on the tape")
    else:
        bullets.append(f"Cum delta neutral ({buy_pct}% buying)")

    # 2. VWAP relationship
    vwap_pct = (spot - vwap) / vwap * 100
    if spot > vwap:
        score += 0.20
        bullets.append(
            f"Price ${spot:.2f} is ABOVE VWAP ${vwap:.2f} (+{vwap_pct:.2f}%) — "
            "session buyers are profitable; bullish intraday context"
        )
    else:
        score -= 0.20
        bullets.append(
            f"Price ${spot:.2f} is BELOW VWAP ${vwap:.2f} ({vwap_pct:.2f}%) — "
            "session buyers are underwater; bearish intraday context"
        )

    # 3. Delta momentum
    mom = _momentum_and_divergence(df)
    mom_dir  = mom.get("momentum_direction", "")
    mom_pace = mom.get("delta_momentum", "steady")
    divergence = mom.get("divergence")

    if mom_pace == "accelerating" and mom_dir == "bullish":
        score += 0.15
        bullets.append("Delta momentum: accelerating bullish — buying pressure is building")
    elif mom_pace == "accelerating" and mom_dir == "bearish":
        score -= 0.15
        bullets.append("Delta momentum: accelerating bearish — selling pressure is building")
    elif mom_pace == "decelerating":
        adj = -0.05 if mom_dir == "bullish" else 0.05
        score += adj
        bullets.append(f"Delta momentum: decelerating {mom_dir} — pressure is fading")
    else:
        bullets.append(f"Delta momentum: steady {mom_dir}")

    # 4. Price/delta divergence — strongest reversal signal
    if divergence == "bearish":
        score -= 0.20
        bullets.append("⚠ BEARISH DIVERGENCE: price rising but cumulative delta falling — buyers exhausted, pullback risk")
    elif divergence == "bullish":
        score += 0.20
        bullets.append("⚠ BULLISH DIVERGENCE: price falling but delta rising — sellers losing conviction, reversal setup")

    # 5. Large institutional prints
    if lp_count > 0:
        big = df[df["is_large_print"]]
        big_buy  = int(big["buy_vol"].sum())
        big_sell = int(big["sell_vol"].sum())
        if big_buy > big_sell * 1.5:
            score += 0.10
            bullets.append(f"{lp_count} large prints — institutional block flow skews bullish")
        elif big_sell > big_buy * 1.5:
            score -= 0.10
            bullets.append(f"{lp_count} large prints — institutional block flow skews bearish")
        else:
            bullets.append(f"{lp_count} large prints — mixed institutional participation")

    if ab_count > 0:
        bullets.append(f"{ab_count} absorption event(s) — heavy volume, little price movement (potential reversal zone)")

    summary = {
        "cum_delta":          cum_delta,
        "buy_pct":            buy_pct,
        "spot":               round(spot, 2),
        "vwap":               round(vwap, 2),
        "vwap_pct":           round(vwap_pct, 2),
        "large_print_count":  lp_count,
        "absorption_count":   ab_count,
        "delta_momentum":     mom_pace,
        "momentum_direction": mom_dir,
        "divergence":         divergence,
        "total_volume":       total_vol,
    }
    return round(score, 3), bullets, summary


# ── Conflict interpretation ────────────────────────────────────────────────────

def _conflict_note(opt_score: float, flow_s: float) -> str:
    opt_dir  = 1 if opt_score > 0.05 else -1 if opt_score < -0.05 else 0
    flow_dir = 1 if flow_s   > 0.05 else -1 if flow_s   < -0.05 else 0
    if opt_dir == flow_dir or opt_dir == 0 or flow_dir == 0:
        return ""
    if opt_dir == -1 and flow_dir == 1:
        return (
            "Put-heavy options positioning + bullish order flow often indicates institutional "
            "investors buying protective puts as insurance on existing long positions — NOT outright bearish bets. "
            "The intraday buying pressure (above VWAP, positive delta) is the cleaner near-term directional signal. "
            "Trust the flow until the options signal is confirmed by a VWAP rejection."
        )
    return (
        "Call-heavy options positioning + bearish order flow can indicate covered-call writing "
        "(selling calls against a long position to generate income) or retail call-buying while "
        "institutions quietly distribute. Price below VWAP with negative delta is a real-time warning. "
        "Wait for a VWAP reclaim before trusting the bullish options signal."
    )


# ── Model ──────────────────────────────────────────────────────────────────────

class OptionsOrderConfluenceModel(QuantModel):
    id          = "confluence"
    name        = "Options × Order Flow"
    description = (
        "Combines options chain (PC_ATM, GEX, max pain, squeeze) with intraday order flow "
        "(delta, VWAP, momentum, divergence) into one confirmed directional signal."
    )
    category    = "options"
    timeframe   = "short"

    def analyze(self, ticker: str) -> QuantResult:
        ticker = ticker.upper()

        # ── 1. Options chain ──────────────────────────────────────────────────
        try:
            from features.options.analyzers.analysis import get_analysis
            opt_data = get_analysis(ticker, timeframe="1d")
        except Exception as e:
            raise ValueError(f"Options fetch failed for {ticker}: {e}")

        opt_score, opt_bullets = _options_score(opt_data)

        # ── 2. Order flow ─────────────────────────────────────────────────────
        flow_s, flow_bullets, flow_summary = _flow_score(ticker)

        # ── 3. Combined score (options 55%, flow 45%) ─────────────────────────
        combined = round(0.55 * opt_score + 0.45 * flow_s, 3)

        opt_dir  = 1 if opt_score > 0.05 else -1 if opt_score < -0.05 else 0
        flow_dir = 1 if flow_s   > 0.05 else -1 if flow_s   < -0.05 else 0
        agreement = (opt_dir == flow_dir and opt_dir != 0)
        conflict  = (opt_dir != 0 and flow_dir != 0 and opt_dir != flow_dir)

        # ── 4. Direction ──────────────────────────────────────────────────────
        if conflict:
            direction = 0   # forced neutral until conflict resolves
        elif combined > 0.15:
            direction = 1
        elif combined < -0.15:
            direction = -1
        else:
            direction = 0

        # ── 5. Confidence ─────────────────────────────────────────────────────
        base_conf = min(abs(combined) * 85.0, 65.0)
        if agreement:
            base_conf += 22.0
        if conflict:
            base_conf = max(base_conf - 25.0, 15.0)
        confidence = round(max(15.0, min(92.0, base_conf)), 1)
        if direction == 0:
            confidence = min(confidence, 45.0)

        # ── 6. Regime label ───────────────────────────────────────────────────
        pc_atm = opt_data.get("pc_atm_ratio")
        spot   = opt_data.get("spot_price", 0)

        if conflict:
            o_lbl = "bearish" if opt_score < 0 else "bullish"
            f_lbl = "bullish" if flow_s > 0 else "bearish"
            regime = f"Signal Conflict — options {o_lbl} vs flow {f_lbl}"
        elif agreement and direction == 1:
            regime = "Dual Confirmation — options + flow both bullish"
        elif agreement and direction == -1:
            regime = "Dual Confirmation — options + flow both bearish"
        elif direction == 1:
            regime = f"Bullish lean — combined {combined:+.2f}"
        elif direction == -1:
            regime = f"Bearish lean — combined {combined:+.2f}"
        else:
            regime = f"Neutral / Mixed — combined {combined:+.2f}"

        # ── 7. Signals ────────────────────────────────────────────────────────
        note = _conflict_note(opt_score, flow_s)
        signals = (
            [f"Options chain (score {opt_score:+.2f})"]
            + opt_bullets
            + [f"Order flow (score {flow_s:+.2f})"]
            + flow_bullets
        )
        if note:
            signals += ["Conflict analysis", note]
        signals.append(f"Combined score {combined:+.2f} — weights: options 55% / flow 45%")

        # ── 8. Summary ────────────────────────────────────────────────────────
        vwap_above = (flow_summary.get("vwap_pct") or 0) > 0
        if direction == 1 and agreement:
            summary = (
                f"Strong bullish confluence on {ticker}: options show call-heavy positioning "
                f"(PC_ATM {pc_atm:.2f}) AND intraday order flow is net bullish "
                f"({'above' if vwap_above else 'below'} VWAP). Both sources agree — high conviction. "
                f"Combined score {combined:+.2f}."
            )
        elif direction == -1 and agreement:
            summary = (
                f"Strong bearish confluence on {ticker}: options show put-heavy positioning "
                f"(PC_ATM {pc_atm:.2f}) AND intraday order flow is net bearish "
                f"({'below' if not vwap_above else 'above'} VWAP). Both sources agree — high conviction. "
                f"Combined score {combined:+.2f}."
            )
        elif conflict:
            o_lbl = "bearish" if opt_score < 0 else "bullish"
            f_lbl = "bullish" if flow_s > 0 else "bearish"
            summary = (
                f"Conflicting signals on {ticker}: options chain is {o_lbl} (score {opt_score:+.2f}) "
                f"but intraday order flow is {f_lbl} (score {flow_s:+.2f}). "
                f"See conflict analysis — direction is ambiguous until one signal yields."
            )
        else:
            summary = (
                f"{ticker} shows a {regime.lower()} (combined {combined:+.2f}). "
                f"Options score {opt_score:+.2f} | Flow score {flow_s:+.2f}. "
                f"No strong dual-source confirmation."
            )

        # ── 9. Chart data ─────────────────────────────────────────────────────
        return QuantResult(
            ticker     = ticker,
            model_id   = self.id,
            model_name = self.name,
            category   = self.category,
            timeframe  = self.timeframe,
            direction  = direction,
            confidence = confidence,
            regime     = regime,
            summary    = summary,
            signals    = signals,
            chart_data = {
                "score_bars": [
                    {"label": "Options Chain", "score": opt_score,  "type": "options"},
                    {"label": "Order Flow",    "score": flow_s,     "type": "flow"},
                    {"label": "Combined",      "score": combined,   "type": "combined"},
                ],
            },
            meta = {
                "options_score":  opt_score,
                "flow_score":     flow_s,
                "combined_score": combined,
                "agreement":      agreement,
                "conflict":       conflict,
                "pc_atm":         pc_atm,
                "pc_vol":         opt_data.get("pc_vol_ratio"),
                "max_pain":       opt_data.get("max_pain"),
                "spot":           spot,
                "vwap":           flow_summary.get("vwap"),
                "cum_delta":      flow_summary.get("cum_delta"),
                "vwap_pct":       flow_summary.get("vwap_pct"),
                "gex_env":        (opt_data.get("gex") or {}).get("environment"),
                "squeeze":        opt_data.get("squeeze_candidate", False),
                "divergence":     flow_summary.get("divergence"),
                "conflict_note":  note,
            },
        )
