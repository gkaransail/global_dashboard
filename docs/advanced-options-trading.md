# Advanced Option Chain Analysis

## The Greeks — what actually drives price

Most traders look at strike and premium. Smart traders look at these:

### Delta (Δ)
How much the option moves per $1 move in the stock.
- Call: 0 to 1. Put: -1 to 0
- Delta 0.50 = at-the-money (50% chance of expiring ITM)
- **Trade use:** Buying a 0.30 delta call = you need a strong move to profit. Selling a 0.80 delta call = highly exposed if the stock rips up.

### Gamma (Γ)
How fast delta changes per $1 move in the stock.
- Highest near ATM and near expiration
- **Trade use:** High gamma = your position changes character fast. Dangerous to be short gamma near expiry — a $2 move can turn a 0.40 delta option into a 0.80 delta one. This is why market makers dread "gamma squeezes."

### Theta (Θ)
Time decay per day.
- Always negative for buyers, positive for sellers
- Accelerates in the last 30 days, fastest in the final week
- **Trade use:** If you're buying options, theta is your enemy. If you're selling (covered calls, credit spreads), theta is your income.

### Vega (V)
Sensitivity to implied volatility changes.
- Higher for longer-dated options and ATM strikes
- **Trade use:** Before earnings, IV inflates — vega works for you as a buyer. After earnings, IV collapses. Even if you're right on direction, you can still lose money. This is called an **IV crush**.

---

## Implied Volatility — the most underused signal

IV is what the market *implies* future volatility will be, priced backwards from the option premium.

### IV Rank (IVR)
Where current IV sits relative to its 52-week range:
```
IVR = (Current IV - 52w Low) / (52w High - 52w Low) × 100
```
- IVR > 50: IV is elevated → selling premium is statistically favorable
- IVR < 20: IV is cheap → buying options is cheaper than usual

### IV Skew
The shape of IV across strikes.
- Normal: puts have higher IV than calls (fear of downside = put buyers pay more)
- Steep put skew: market is pricing in crash risk
- Flat or reverse skew: unusual — market pricing in upside risk (meme stocks, pre-earnings squeeze plays)

### IV Term Structure
IV across expiry dates.
- Normal: near-term IV lower than far-term (calm now, uncertain later)
- Inverted: near-term IV higher — an earnings report, FDA decision, or macro event is coming up. Watch for this as a signal.

---

## Open Interest and Volume — following the money

### Open Interest (OI)
Total number of active contracts at a strike.
- High OI = major players have large positions there
- OI alone doesn't tell you direction (a big OI could be buyers OR sellers)

### Volume vs OI Ratio
- Volume >> OI: new position being opened, fresh conviction
- Volume << OI: existing positions being traded, weaker signal

### Put/Call Ratio (PCR)
```
PCR = Put Volume / Call Volume
```
- PCR > 1.2: heavy put buying — bearish sentiment or hedging
- PCR < 0.7: heavy call buying — bullish sentiment or speculation
- **Contrarian use:** extreme PCR readings can signal reversals (too many people on one side)

---

## Max Pain — the magnet strike

Max pain is the strike where the most options expire worthless — where option sellers (usually market makers) lose the least.

**How to calculate:** For every strike, compute the total dollar loss to ALL option holders if price expires there. The strike with the minimum total loss = max pain.

**Why it matters:**
- Market makers hedge dynamically and are incentivized to pin price near max pain into expiry
- Not a guarantee, but price statistically gravitates toward max pain in the final 1-2 days
- Use it as a **magnet level**, especially for weeklies

---

## Unusual Options Activity — detecting smart money

Look for:
- **Volume spike:** option volume 5x+ above average OI
- **Large block trades:** single orders for 1,000+ contracts
- **OTM calls/puts with heavy flow:** someone buying way OTM is making a directional bet, not hedging
- **Premium paid:** if someone pays $2 for an OTM call needing a 15% move, they believe something is coming

**Red flags (hedging, not a signal):**
- Puts bought alongside a large stock position = portfolio insurance, not a bear bet
- Collars (buying puts + selling calls together) = hedging, not directional

---

## Reading a Chain in Practice — step by step

Example: AAPL before earnings.

1. **Check IVR** — is IV elevated? IVR > 60 means premiums are expensive. Selling spreads may beat buying outright.

2. **Look at the ATM straddle price** — this is the market's expected move. If the straddle costs $4, the market expects ±$4 by expiry. Compare to historical earnings moves.

3. **Check skew** — is IV skew steep toward puts (fear) or flat? Steep put skew = market worried about downside.

4. **Find max pain** — where is the gravitational center? If max pain is $5 below current price, selling a call spread above current price has a tailwind.

5. **Scan unusual flow** — has there been a big sweep on OTM calls in the last few days? That's informed money positioning.

6. **Choose your structure based on your thesis:**

| Thesis | Structure |
|---|---|
| Strong directional move | Buy ITM call/put (high delta, less theta burn) |
| Modest move or drift | Vertical spread (defined risk, lower cost) |
| Stock stays flat | Iron condor or short strangle |
| Earnings — direction unclear | Straddle/strangle before, close before IV crush |
| IV is high, want to sell premium | Cash-secured put, covered call, credit spread |

---

## The One Mistake Most Traders Make

Buying OTM options because they're "cheap."

A $0.30 option that needs a 20% move in 2 weeks isn't cheap — it has maybe a 5% chance of paying off. You're paying for lottery tickets.

**Better rule:** if you're buying options, stay within 1 standard deviation of the current price (roughly the range defined by the ATM straddle price). If you're selling, sell outside that range.

---

## Quick Reference — When to Buy vs Sell Options

| Condition | Action |
|---|---|
| IVR < 20 (IV cheap) | Buy options |
| IVR > 50 (IV expensive) | Sell options / spreads |
| Pre-earnings (IV rising) | Buy straddle, close before announcement |
| Post-earnings (IV crushed) | Sell premium on next cycle |
| Stock trending strongly | Buy ITM calls/puts with high delta |
| Stock range-bound | Iron condor, short strangle |
| Unusual OTM call sweep | Follow the flow (cautiously) |
| Steep put skew | Market is fearful — consider bull put spread |
