import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

// ─────────────────────────────────────────────────────────────────────────────
// AI_HOOK: This component is ready for AI integration.
// When you add AI, replace the <AISummaryStub> with a real <AISummary> that:
//   1. Calls POST /api/v1/ai/options-summary  (endpoint you build)
//   2. Sends: { ticker, snapshot: data }
//   3. Receives: { headline, bullets[], sentiment }
// Everything else in this file stays the same.
// ─────────────────────────────────────────────────────────────────────────────

function AISummaryStub({ ticker, data }) {
  // Generates a plain-English preview from existing data so the stub looks useful.
  // Replace this entire function body with a real AI API call when ready.
  if (!data) return null

  const mood = data.pc_ratio > 1.2 ? 'cautious' : data.pc_ratio < 0.8 ? 'bullish' : 'mixed'
  const ivWord = data.atm_iv_pct > 60 ? 'expensive' : data.atm_iv_pct > 35 ? 'normal-priced' : 'cheap'
  const em = data.expected_move
  const preview = em
    ? `Options on ${ticker} suggest a ${mood} market. The market is pricing in a ±${em.move_pct}% move by ${data.selected_expiration.label}. Options are currently ${ivWord}.`
    : `Options on ${ticker} show ${mood} positioning.`

  return (
    <div className="ov-ai-card">
      <div className="ov-ai-header">
        <div className="ov-ai-icon">✦</div>
        <div>
          <div className="ov-ai-title">AI Summary</div>
          <div className="ov-ai-sub">Auto-generated plain-English briefing</div>
        </div>
        <span className="badge badge-soon">AI Coming Soon</span>
      </div>
      <div className="ov-ai-body">
        <p className="ov-ai-preview">{preview}</p>
        <div className="ov-ai-upgrade">
          <span className="ov-ai-upgrade-icon">🤖</span>
          <span>When AI is enabled, you'll get a full briefing: what smart money is doing, what move the market expects, and what levels to watch — all in plain English.</span>
        </div>
      </div>
    </div>
  )
}

// Plain-English interpretation helpers
function moodFromPC(pc) {
  if (!pc) return { label: 'Unknown', color: 'var(--muted)', emoji: '❓', explain: 'Not enough data.' }
  if (pc > 1.4) return { label: 'Very Bearish', color: 'var(--bear)', emoji: '🔴', explain: 'Way more put (downside) bets than calls. Big players are hedging or betting on a drop.' }
  if (pc > 1.1) return { label: 'Cautious', color: 'var(--bear)', emoji: '🟠', explain: 'More people buying protection (puts) than upside bets (calls). Mild caution in the market.' }
  if (pc > 0.9) return { label: 'Neutral', color: 'var(--muted)', emoji: '🟡', explain: 'Roughly balanced between upside and downside bets. No clear directional conviction.' }
  if (pc > 0.7) return { label: 'Bullish', color: 'var(--bull)', emoji: '🟢', explain: 'More call (upside) buying than put buying. Market leans bullish on this stock.' }
  return { label: 'Very Bullish', color: 'var(--bull)', emoji: '🟢', explain: 'Heavily skewed toward calls. Strong bullish positioning from options traders.' }
}

function ivWord(iv) {
  if (!iv) return { label: '—', color: 'var(--muted)', explain: 'No IV data.' }
  if (iv > 80) return { label: 'Very Expensive', color: 'var(--bear)', explain: `IV at ${iv}% is very high. Options cost a lot. The market expects a big move — likely an event like earnings, news, or macro shock.` }
  if (iv > 50) return { label: 'Expensive', color: 'var(--gold)', explain: `IV at ${iv}% is elevated. Options aren't cheap. The market is pricing in meaningful uncertainty.` }
  if (iv > 30) return { label: 'Normal', color: 'var(--muted)', explain: `IV at ${iv}% is in a normal range. Options are fairly priced.` }
  return { label: 'Cheap', color: 'var(--bull)', explain: `IV at ${iv}% is low. Options are cheap — the market expects a quiet period ahead.` }
}

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="ov-tooltip-wrap" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="ov-tooltip-icon">?</span>
      {show && <div className="ov-tooltip-box">{text}</div>}
    </span>
  )
}

function GlossaryCard() {
  return (
    <div className="ov-glossary">
      <div className="ov-glossary-title">📖 Options 101 — Plain English</div>
      <div className="ov-glossary-grid">
        {[
          { term: 'Call option', def: 'A bet that the stock goes UP. You profit if the stock rises above the strike price.' },
          { term: 'Put option', def: 'A bet that the stock goes DOWN. You profit if the stock falls below the strike price.' },
          { term: 'P/C Ratio', def: 'Put-to-Call ratio. Above 1.0 means more bearish bets than bullish. Below 1.0 means more bullish bets.' },
          { term: 'Implied Volatility (IV)', def: 'How much movement the options market is pricing in. High IV = expensive options = big expected move.' },
          { term: 'Open Interest (OI)', def: 'How many contracts are currently open at a strike. High OI = lots of money sitting there = acts as support or resistance.' },
          { term: 'Max Pain', def: 'The price where option sellers (usually banks/market makers) lose the least money. Stocks often drift toward this level near expiry.' },
          { term: 'Expected Move', def: 'The market\'s best guess of how far the stock will move ±1 standard deviation by expiration. Based on IV math.' },
          { term: 'Strike price', def: 'The price level the option bet is made at. A $200 call means you\'re betting the stock goes above $200.' },
          { term: 'DTE (Days to Expiry)', def: 'How many days until the option contract expires and becomes worthless or gets exercised.' },
          { term: 'ATM (At The Money)', def: 'The strike price closest to the current stock price. ATM options have the most time value.' },
        ].map(({ term, def }) => (
          <div key={term} className="ov-glossary-item">
            <div className="ov-glossary-term">{term}</div>
            <div className="ov-glossary-def">{def}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OptionsOverview() {
  const { ticker, timeframe } = useStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [macro, setMacro] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [ticker, timeframe])

  async function load() {
    setLoading(true); setError(null)
    try {
      const [snap, mac] = await Promise.all([
        api.get(`/options/analysis/${ticker}?timeframe=${timeframe}`),
        api.get('/reversal/macro').catch(() => null),
      ])
      setData(snap)
      setMacro(mac)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /><span>Reading options data for {ticker}...</span></div>
  if (error)   return <div className="pad"><div className="error-box">⚠ {error}</div></div>
  if (!data)   return null

  const mood   = moodFromPC(data.pc_ratio)
  const ivInfo = ivWord(data.atm_iv_pct)
  const em     = data.expected_move
  const vix    = macro?.vix
  const vixLevel = vix ? (vix.price > 30 ? { label: 'High Fear', color: 'var(--bear)' } : vix.price > 20 ? { label: 'Elevated', color: 'var(--gold)' } : { label: 'Calm', color: 'var(--bull)' }) : null

  const resistanceLevels = data.key_levels?.filter(l => l.role === 'resistance') ?? []
  const supportLevels    = data.key_levels?.filter(l => l.role === 'support') ?? []
  const topResistance    = resistanceLevels[0]
  const topSupport       = supportLevels[0]

  return (
    <div className="pad ov-root">

      {/* ── AI Summary stub ─────────────────────────────────── */}
      <AISummaryStub ticker={ticker} data={data} />

      {/* ── At a Glance ─────────────────────────────────────── */}
      <div>
        <div className="section-title">At a Glance — {ticker} Options</div>
        <div className="ov-glance-grid">

          <div className="ov-glance-card">
            <div className="ov-glance-label">
              Market Mood
              <Tooltip text={`Based on Put/Call ratio of ${data.pc_ratio?.toFixed(2)}. More puts = more bearish bets. More calls = more bullish bets.`} />
            </div>
            <div className="ov-glance-val" style={{ color: mood.color }}>{mood.emoji} {mood.label}</div>
            <div className="ov-glance-explain">{mood.explain}</div>
          </div>

          <div className="ov-glance-card">
            <div className="ov-glance-label">
              Expected Move by {data.selected_expiration.label}
              <Tooltip text="This is the ±1 standard deviation move implied by options pricing. 68% chance the stock stays within this range." />
            </div>
            {em ? (
              <>
                <div className="ov-glance-val">±{em.move_pct}%</div>
                <div className="ov-glance-explain">
                  Stock expected to stay between <span style={{ color: 'var(--bear)' }}>${em.lower}</span> and <span style={{ color: 'var(--bull)' }}>${em.upper}</span> with ~68% probability.
                </div>
              </>
            ) : <div className="ov-glance-val">—</div>}
          </div>

          <div className="ov-glance-card">
            <div className="ov-glance-label">
              Options Pricing
              <Tooltip text={`ATM IV = ${data.atm_iv_pct}%. This tells you how expensive options are. High IV = big move expected. Low IV = quiet expected.`} />
            </div>
            <div className="ov-glance-val" style={{ color: ivInfo.color }}>{ivInfo.label}</div>
            <div className="ov-glance-explain">{ivInfo.explain}</div>
          </div>

          <div className="ov-glance-card">
            <div className="ov-glance-label">
              Price Magnet (Max Pain)
              <Tooltip text="The price where option sellers lose the least money. Stocks often slowly drift toward this level as expiry approaches — especially in the last few days." />
            </div>
            <div className="ov-glance-val" style={{ color: 'var(--gold)' }}>
              {data.max_pain ? `$${data.max_pain}` : '—'}
            </div>
            {data.max_pain && (
              <div className="ov-glance-explain">
                Currently {data.max_pain > data.spot_price ? 'above' : 'below'} spot (${data.spot_price}).
                Expect gravitational pull toward ${data.max_pain} near expiry.
              </div>
            )}
          </div>

          {vix && (
            <div className="ov-glance-card">
              <div className="ov-glance-label">
                Market Fear (VIX)
                <Tooltip text="The VIX measures overall stock market fear. Above 30 = panic. 20-30 = elevated. Below 20 = calm. High VIX means options everywhere are expensive." />
              </div>
              <div className="ov-glance-val" style={{ color: vixLevel.color }}>{vix.price.toFixed(1)} — {vixLevel.label}</div>
              <div className="ov-glance-explain">
                {vix.price > 30
                  ? 'Market is in fear mode. Options are expensive across the board.'
                  : vix.price > 20
                  ? 'Elevated uncertainty. Some caution in broader market.'
                  : 'Market is calm. Good time to buy protection cheaply if you need it.'}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Floor & Ceiling ─────────────────────────────────── */}
      {(topResistance || topSupport) && (
        <div>
          <div className="section-title">Key Levels — Where Big Money Is Sitting</div>
          <div className="ov-levels">
            {topResistance && (
              <div className="ov-level-card ov-level-resistance">
                <div className="ov-level-role">🚧 Resistance Ceiling</div>
                <div className="ov-level-strike">${topResistance.strike}</div>
                <div className="ov-level-detail">
                  {topResistance.oi?.toLocaleString()} call contracts sit here ({topResistance.pct_from_spot > 0 ? '+' : ''}{topResistance.pct_from_spot}% from current price).
                  This acts like a ceiling — call sellers will push back against price going above this.
                </div>
              </div>
            )}
            <div className="ov-level-current">
              <div className="ov-level-spot-label">Current Price</div>
              <div className="ov-level-spot">${data.spot_price}</div>
            </div>
            {topSupport && (
              <div className="ov-level-card ov-level-support">
                <div className="ov-level-role">🛡 Support Floor</div>
                <div className="ov-level-strike">${topSupport.strike}</div>
                <div className="ov-level-detail">
                  {topSupport.oi?.toLocaleString()} put contracts sit here ({topSupport.pct_from_spot > 0 ? '+' : ''}{topSupport.pct_from_spot}% from current price).
                  This acts like a floor — put sellers defend this level aggressively.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Full narrative ───────────────────────────────────── */}
      {data.narrative && (
        <div>
          <div className="section-title">What the Data Says</div>
          <div className="ov-narrative">{data.narrative}</div>
        </div>
      )}

      {/* ── Explore Further ─────────────────────────────────── */}
      <div>
        <div className="section-title">Dig Deeper</div>
        <div className="ov-explore">
          {[
            { path: '../chain', icon: '⛓', title: 'Options Chain', desc: 'See every strike price, how many contracts, and what they\'re worth right now.' },
            { path: '../unusual', icon: '🚨', title: 'Unusual Activity', desc: 'Find where big money made suspiciously large bets — often a signal of insider positioning.' },
            { path: '../skew', icon: '📐', title: 'IV Skew & Term Structure', desc: 'See how fear changes across strike prices and expiration dates.' },
          ].map(({ path, icon, title, desc }) => (
            <button key={path} className="ov-explore-card" onClick={() => navigate(path)}>
              <div className="ov-explore-icon">{icon}</div>
              <div>
                <div className="ov-explore-title">{title}</div>
                <div className="ov-explore-desc">{desc}</div>
              </div>
              <div className="ov-explore-arrow">→</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Glossary ─────────────────────────────────────────── */}
      <GlossaryCard />

    </div>
  )
}
