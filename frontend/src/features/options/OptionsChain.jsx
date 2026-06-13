import { useState, useEffect, useCallback } from 'react'
import { useStore, lookbackForTimeframe } from '../../core/store'
import { api } from '../../core/api'
import MarketSnapshot from './MarketSnapshot'

const fmt = (v, d = 2) => v == null ? '—' : Number(v).toFixed(d)
const fmtK = (v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(v)

// ─────────────────────────────────────────────────────────────────────────────
// "How to Read This Chain" — interactive guide for new users
// ─────────────────────────────────────────────────────────────────────────────
function ChainGuide({ spot }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="chain-guide">
      <button className="chain-guide-toggle" onClick={() => setOpen(o => !o)}>
        <span>📚 How to read this options chain</span>
        <span className="chain-guide-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="chain-guide-body">

          {/* Visual map of the chain layout */}
          <div className="cg-layout-map">
            <div className="cg-side cg-calls">
              <div className="cg-side-title">🟢 LEFT SIDE = CALLS</div>
              <div className="cg-side-sub">Bets the stock goes <strong>UP</strong></div>
              <div className="cg-side-detail">Green rows = ITM (stock is already above this strike — these have real value right now)</div>
            </div>
            <div className="cg-center">
              <div className="cg-center-title">STRIKE</div>
              <div className="cg-center-sub">The price level<br/>the bet is at</div>
              <div className="cg-atm-badge">ATM = highlighted in blue<br/>(closest to ${spot?.toFixed(0)} — current price)</div>
            </div>
            <div className="cg-side cg-puts">
              <div className="cg-side-title">🔴 RIGHT SIDE = PUTS</div>
              <div className="cg-side-sub">Bets the stock goes <strong>DOWN</strong></div>
              <div className="cg-side-detail">Red rows = ITM (stock is already below this strike — these have real value right now)</div>
            </div>
          </div>

          {/* Column explanations */}
          <div className="cg-columns">
            <div className="cg-col-title">What each column means:</div>
            <div className="cg-col-grid">
              {[
                { col: 'Vol',   color: 'var(--text)',    what: 'Volume',              explain: 'How many contracts traded TODAY. High volume = someone is actively betting here right now.' },
                { col: 'OI',    color: 'var(--text)',    what: 'Open Interest',       explain: 'Total contracts currently open at this strike. High OI = lots of money sitting here. Stocks often stall or reverse at these levels.' },
                { col: 'Last',  color: 'var(--muted)',   what: 'Last price',          explain: 'The last traded price of the option contract. Multiply by 100 to get the real cost (each contract = 100 shares).' },
                { col: 'Bid/Ask',color:'var(--muted)',   what: 'Bid / Ask spread',   explain: 'Bid = what buyers will pay. Ask = what sellers want. Wide spread = illiquid (hard to exit). Tight spread = liquid (easy to trade).' },
                { col: 'IV%',   color: 'var(--accent-hi)',what: 'Implied Volatility', explain: 'How expensive this option is. High IV% = big move expected = costly option. Low IV% = quiet expected = cheap option. Compare across strikes to spot fear.' },
                { col: 'Δ Delta',color:'var(--bull)',    what: 'Delta',               explain: 'How much this option moves per $1 change in the stock. Delta 0.50 = moves $0.50 per $1 stock move. Calls: 0 to 1. Puts: -1 to 0. Deep ITM ≈ 1.0.' },
                { col: 'θ Theta',color:'var(--bear)',    what: 'Theta (time decay)',  explain: 'How much value this option loses every day just from time passing. -$0.05 means the option loses $5 per day per contract (100 shares). Time decay kills options you hold too long.' },
              ].map(({ col, color, what, explain }) => (
                <div key={col} className="cg-col-row">
                  <div className="cg-col-name" style={{ color }}>{col}</div>
                  <div className="cg-col-what">{what}</div>
                  <div className="cg-col-explain">{explain}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick rules */}
          <div className="cg-rules">
            <div className="cg-rules-title">Quick rules when reading a chain:</div>
            <div className="cg-rules-grid">
              {[
                { icon: '📍', rule: 'Start at ATM (blue strike)', detail: 'That\'s where current options pricing is most relevant to the current stock price.' },
                { icon: '📊', rule: 'Check Call OI vs Put OI', detail: 'If calls have much higher OI than puts → market leans bullish. If puts dominate → people are hedging or betting on a drop.' },
                { icon: '💰', rule: 'Vol >> OI = unusual activity', detail: 'If today\'s volume is much larger than the existing open interest, someone just made a big directional bet. Check the Unusual Activity tab.' },
                { icon: '🧱', rule: 'Big OI = price magnet/wall', detail: 'Strikes with massive OI act like magnets near expiry (max pain) or walls that resist price movement.' },
                { icon: '📈', rule: 'High IV% → expensive options', detail: 'Before earnings or big events, IV spikes. After the event passes, IV crashes (IV crush), killing option value even if the stock moved your way.' },
                { icon: '⏰', rule: 'Theta kills slow trades', detail: 'Every day that passes, your option loses value from time decay (theta). Only buy options when you expect a move SOON.' },
              ].map(({ icon, rule, detail }) => (
                <div key={rule} className="cg-rule-card">
                  <div className="cg-rule-icon">{icon}</div>
                  <div>
                    <div className="cg-rule-name">{rule}</div>
                    <div className="cg-rule-detail">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

function SummaryBar({ summary, spot }) {
  const { total_call_oi, total_put_oi, total_call_vol, total_put_vol, pc_oi_ratio, atm_iv_pct } = summary
  const pcColor = pc_oi_ratio > 1 ? 'var(--bear)' : 'var(--bull)'
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, padding: '10px 0' }}>
      {[
        { label: 'Spot',         val: `$${fmt(spot)}`,               color: 'var(--text)' },
        { label: 'ATM IV',       val: `${atm_iv_pct ?? '—'}%`,       color: 'var(--accent)' },
        { label: 'P/C OI Ratio', val: fmt(pc_oi_ratio),              color: pcColor },
        { label: 'Call OI',      val: fmtK(total_call_oi),           color: 'var(--bull)' },
        { label: 'Put OI',       val: fmtK(total_put_oi),            color: 'var(--bear)' },
        { label: 'Call Vol',     val: fmtK(total_call_vol),          color: 'var(--bull)' },
        { label: 'Put Vol',      val: fmtK(total_put_vol),           color: 'var(--bear)' },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
          <span style={{ fontWeight: 700, color }}>{val}</span>
        </div>
      ))}
    </div>
  )
}

function ChainTable({ calls, puts, spot, showGreeks }) {
  const [sort, setSort] = useState({ col: 'strike', side: null, dir: 1 })

  const callMap = Object.fromEntries(calls.map(c => [c.strike, c]))
  const putMap  = Object.fromEntries(puts.map(p => [p.strike, p]))

  // Build sorted strikes array based on active sort
  const allStrikes = [...new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])]
  const strikes = allStrikes.sort((a, b) => {
    if (!sort.side || sort.col === 'strike') return sort.dir * (a - b)
    const map = sort.side === 'call' ? callMap : putMap
    const va  = map[a]?.[sort.col] ?? -Infinity
    const vb  = map[b]?.[sort.col] ?? -Infinity
    return sort.dir * (vb - va)  // descending = show biggest first
  })

  const itmCallBg = 'rgba(34,197,94,0.06)'
  const itmPutBg  = 'rgba(239,68,68,0.06)'
  const atmBorder = '1px solid var(--accent)'

  const callCols = showGreeks
    ? ['volume','oi','last','bid','ask','iv_pct','delta','theta','vega']
    : ['volume','oi','last','bid','ask','iv_pct']
  const putCols  = showGreeks
    ? ['vega','iv_pct','delta','theta','ask','bid','last','oi','volume']
    : ['iv_pct','ask','bid','last','oi','volume']

  const COL_LABEL = { volume:'Vol', oi:'OI', last:'Last', bid:'Bid', ask:'Ask', iv_pct:'IV%', delta:'Δ', gamma:'Γ', theta:'θ', vega:'ν Vega', mid:'Mid' }
  const isAtm = (s) => Math.abs(s - spot) <= 1.5

  function handleSortCall(col) {
    setSort(s => s.col === col && s.side === 'call'
      ? { ...s, dir: -s.dir }
      : { col, side: 'call', dir: -1 })
  }
  function handleSortPut(col) {
    setSort(s => s.col === col && s.side === 'put'
      ? { ...s, dir: -s.dir }
      : { col, side: 'put', dir: -1 })
  }
  function handleSortStrike() {
    setSort(s => s.col === 'strike' ? { col: 'strike', side: null, dir: -s.dir } : { col: 'strike', side: null, dir: 1 })
  }

  const sortArrow = (col, side) => {
    if (sort.col !== col || sort.side !== side) return null
    return <span style={{ marginLeft: 3, fontSize: 8, color: 'var(--accent)' }}>{sort.dir > 0 ? '▲' : '▼'}</span>
  }
  const thStyle = (align, active) => ({
    padding: '8px 6px', textAlign: align,
    color: active ? 'var(--accent)' : 'var(--muted)',
    fontWeight: active ? 700 : 600, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '.5px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      {sort.col !== 'strike' && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--accent)', background: 'rgba(79,142,247,0.06)', borderBottom: '1px solid var(--border)' }}>
          Sorted by {sort.side} {COL_LABEL[sort.col]} {sort.dir > 0 ? '▲' : '▼'} —
          <button onClick={() => setSort({ col: 'strike', side: null, dir: 1 })}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}>
            reset to strike order ✕
          </button>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 1 }}>
            {callCols.map(c => (
              <th key={`ch-${c}`} onClick={() => handleSortCall(c)}
                style={thStyle('right', sort.col === c && sort.side === 'call')}>
                {COL_LABEL[c]}{sortArrow(c, 'call')}
              </th>
            ))}
            <th onClick={handleSortStrike}
              style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, fontSize: 11, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', userSelect: 'none', color: sort.col === 'strike' ? 'var(--accent)' : 'var(--text)' }}>
              STRIKE{sort.col === 'strike' ? <span style={{ marginLeft: 3, fontSize: 8 }}>{sort.dir > 0 ? '▲' : '▼'}</span> : null}
            </th>
            {putCols.map(c => (
              <th key={`ph-${c}`} onClick={() => handleSortPut(c)}
                style={thStyle('left', sort.col === c && sort.side === 'put')}>
                {COL_LABEL[c]}{sortArrow(c, 'put')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map(strike => {
            const call = callMap[strike]
            const put  = putMap[strike]
            const atm  = isAtm(strike)
            const rowBorder = atm ? { borderTop: atmBorder, borderBottom: atmBorder } : {}

            return (
              <tr key={strike} style={{ ...rowBorder, transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>

                {/* Call cells */}
                {callCols.map(col => {
                  const v = call?.[col]
                  const bg = call?.itm ? itmCallBg : ''
                  const isVol = col === 'volume' || col === 'oi'
                  const displayVal = v == null ? '—' : isVol ? fmtK(v) : col === 'iv_pct' ? `${fmt(v, 1)}%` : fmt(v, col === 'delta' || col === 'theta' || col === 'vega' ? 3 : 2)
                  return (
                    <td key={col} style={{ padding: '6px 6px', textAlign: 'right', background: bg, color: call?.itm ? 'var(--bull)' : 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                      {displayVal}
                    </td>
                  )
                })}

                {/* Strike cell */}
                <td style={{
                  padding: '6px 10px', textAlign: 'center', fontWeight: 700,
                  borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  color: atm ? 'var(--accent)' : 'var(--text)',
                  fontSize: atm ? 13 : 12,
                  background: atm ? 'rgba(79,142,247,0.08)' : '',
                }}>
                  {atm && <span style={{ fontSize: 9, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>ATM</span>}
                  {strike}
                </td>

                {/* Put cells */}
                {putCols.map(col => {
                  const v = put?.[col]
                  const bg = put?.itm ? itmPutBg : ''
                  const isVol = col === 'volume' || col === 'oi'
                  const displayVal = v == null ? '—' : isVol ? fmtK(v) : col === 'iv_pct' ? `${fmt(v, 1)}%` : fmt(v, col === 'delta' || col === 'theta' || col === 'vega' ? 3 : 2)
                  return (
                    <td key={col} style={{ padding: '6px 6px', textAlign: 'left', background: bg, color: put?.itm ? 'var(--bear)' : 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                      {displayVal}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function OptionsChain() {
  const { ticker, timeframe } = useStore()
  const [exps, setExps]               = useState([])
  const [selectedExp, setSelected]     = useState(null)
  const [snapshotExp, setSnapshotExp]  = useState(null)  // best exp from snapshot analysis
  const [chain, setChain]             = useState(null)
  const [spot, setSpot]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [showGreeks, setShowGreeks]   = useState(true)
  const [strikeRange, setStrikeRange] = useState(0.20)

  // Called by MarketSnapshot when analysis resolves the best expiration for the timeframe
  const handleSnapshotExp = useCallback((expDate) => {
    setSnapshotExp(expDate)
    setSelected(expDate)  // auto-sync chain to snapshot's recommended expiration
  }, [])

  useEffect(() => { loadExpirations() }, [ticker, timeframe])
  useEffect(() => { if (selectedExp) loadChain(selectedExp) }, [selectedExp, strikeRange])

  async function loadExpirations() {
    setExps([]); setChain(null); setError(null); setSelected(null); setSnapshotExp(null)
    try {
      const d = await api.get(`/options/expirations/${ticker}`)
      const allExps = d.expirations || []
      setExps(allExps)
      setSpot(d.spot_price)
      // Set a fallback default — snapshot will override with the timeframe-optimal exp
      if (allExps.length) setSelected(allExps[1]?.date || allExps[0].date)
    } catch (e) { setError(e.message) }
  }

  async function loadChain(exp) {
    setLoading(true); setError(null)
    try {
      const d = await api.get(`/options/chain/${ticker}?expiration=${exp}&strike_range=${strikeRange}`)
      setChain(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* How to read guide — for new users */}
      <ChainGuide spot={spot} />

      {/* Market Snapshot — timeframe-aware analysis */}
      <MarketSnapshot onExpSelected={handleSnapshotExp} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Expiration picker */}
        <select
          value={selectedExp || ''}
          onChange={e => setSelected(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
        >
          {exps.map(e => (
            <option key={e.date} value={e.date}>
              {e.date === snapshotExp ? '★ ' : ''}{e.label}{e.weekly ? ' ⚡' : ''}
            </option>
          ))}
        </select>

        {/* Strike range */}
        <select
          value={strikeRange}
          onChange={e => setStrikeRange(Number(e.target.value))}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
        >
          {[0.10, 0.15, 0.20, 0.25, 0.30].map(r => (
            <option key={r} value={r}>±{(r*100).toFixed(0)}% strikes</option>
          ))}
        </select>

        {/* Greeks toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showGreeks} onChange={e => setShowGreeks(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }} />
          Show Greeks (Δ θ)
        </label>

        {chain && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
            {chain.dte}d to expiry · {chain.calls.length + chain.puts.length} contracts shown
          </span>
        )}
      </div>

      {/* Summary bar */}
      {chain && <div className="card card-sm"><SummaryBar summary={chain.summary} spot={chain.spot_price} /></div>}

      {/* Error */}
      {error && <div className="error-box">⚠ {error}</div>}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--muted)' }}>
        <span><span style={{ color: 'var(--bull)' }}>■</span> ITM Calls</span>
        <span><span style={{ color: 'var(--bear)' }}>■</span> ITM Puts</span>
        <span><span style={{ color: 'var(--accent)' }}>■</span> ATM (nearest strike)</span>
        <span>⚡ = Weekly expiration</span>
      </div>

      {/* Chain table */}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Loading chain...</span></div>}
      {!loading && chain && (
        <div className="signals-panel">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', justifyContent: 'space-between' }}>
            <span>← CALLS</span>
            <span>PUTS →</span>
          </div>
          <ChainTable calls={chain.calls} puts={chain.puts} spot={chain.spot_price} showGreeks={showGreeks} />
        </div>
      )}
    </div>
  )
}
