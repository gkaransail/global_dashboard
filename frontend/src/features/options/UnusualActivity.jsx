import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmt = (v, d = 2) => v == null ? '—' : Number(v).toFixed(d)
const fmtPrem = (v) => {
  if (v == null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  return `$${v}`
}

function ScoreBar({ score }) {
  const color = score >= 0.7 ? 'var(--bear)' : score >= 0.5 ? 'var(--gold)' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 5, background: 'var(--border)', borderRadius: 3 }}>
        <div style={{ width: `${score * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{Math.round(score * 100)}%</span>
    </div>
  )
}

function whatItMeans(a) {
  const typeStr = a.type === 'call' ? 'call (upside bet)' : 'put (downside bet)'
  const sizeStr = a.premium_value >= 1_000_000
    ? `a massive $${(a.premium_value/1_000_000).toFixed(1)}M`
    : a.premium_value >= 100_000
    ? `a large $${(a.premium_value/1_000).toFixed(0)}K`
    : `a $${a.premium_value?.toFixed(0)}`
  const volStr = a.vol_oi_ratio > 10
    ? `${a.vol_oi_ratio}× normal volume — extremely unusual`
    : a.vol_oi_ratio > 3
    ? `${a.vol_oi_ratio}× normal volume — notably unusual`
    : `${a.vol_oi_ratio}× normal`
  return `Someone placed ${sizeStr} ${typeStr} at $${a.strike} expiring ${a.expiration_label} (${a.dte} days). Volume is ${volStr}. This is a ${a.sentiment} bet.`
}

export default function UnusualActivity() {
  const { ticker } = useStore()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('all')
  const [sortBy, setSortBy]   = useState('score')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load() }, [ticker])

  async function load() {
    setLoading(true); setError(null); setData(null)
    try {
      const d = await api.get(`/options/unusual/${ticker}`)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const activity = data?.activity ?? []
  const filtered = activity
    .filter(a => filter === 'all' || a.type === filter)
    .sort((a, b) => {
      if (sortBy === 'score')   return b.score - a.score
      if (sortBy === 'premium') return b.premium_value - a.premium_value
      if (sortBy === 'vol_oi')  return (b.vol_oi_ratio ?? 0) - (a.vol_oi_ratio ?? 0)
      return 0
    })

  const bullish = activity.filter(a => a.sentiment === 'bullish').length
  const bearish = activity.filter(a => a.sentiment === 'bearish').length

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary chips */}
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="card card-sm" style={{ display: 'flex', gap: 24, padding: '10px 16px' }}>
            {[
              { label: 'Total Unusual', val: data.total_found, color: 'var(--text)' },
              { label: 'Bullish Flow',  val: bullish, color: 'var(--bull)' },
              { label: 'Bearish Flow',  val: bearish, color: 'var(--bear)' },
              { label: 'Spot Price',    val: `$${data.spot_price?.toFixed(2)}`, color: 'var(--accent)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
                <span style={{ fontWeight: 700, fontSize: 16, color }}>{val}</span>
              </div>
            ))}
          </div>
          <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer' }}>↻ Refresh</button>
        </div>
      )}

      {/* Plain-English explainer */}
      <div className="ov-narrative" style={{ marginBottom: 0 }}>
        <strong>What is unusual activity?</strong> When someone buys significantly more options contracts than usual at a given strike, it suggests a large player — a hedge fund, institution, or informed trader — is making a directional bet. High volume relative to open interest (Vol/OI) is the key signal. These aren't random trades.
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'call', 'put'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`tf-pill ${filter === f ? 'active' : ''}`}>
              {f === 'all' ? 'All' : f === 'call' ? '🟢 Calls (bullish bets)' : '🔴 Puts (bearish bets)'}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sort:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['score', 'Unusual Score'], ['premium', 'Premium $'], ['vol_oi', 'Vol/OI']].map(([k, l]) => (
            <button key={k} onClick={() => setSortBy(k)}
              className={`tf-pill ${sortBy === k ? 'active' : ''}`}>{l}</button>
          ))}
        </div>
        {data && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{filtered.length} contracts</span>}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Scanning options flow...</span></div>}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="signals-panel">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {[
                    ['Type',      'Call = upside bet / Put = downside bet'],
                    ['Strike',    'The price level the bet is made at'],
                    ['Expiry',    'When this contract expires'],
                    ['DTE',       'Days until expiration'],
                    ['Volume',    'Contracts traded today'],
                    ['OI',        'Total open contracts at this strike'],
                    ['Vol/OI',    'How unusual is this volume vs existing positions? Higher = more unusual'],
                    ['IV%',       'Implied Volatility — how expensive this option is'],
                    ['Premium',   'Total money bet on this contract'],
                    ['Direction', 'Which way this bet is pointing'],
                    ['Score',     'How unusual is this trade? Higher = more suspicious / institutional'],
                  ].map(([h, tip]) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}
                      title={tip}>{h} <span style={{ color: 'var(--border-hi)' }}>ⓘ</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const typeColor = a.type === 'call' ? 'var(--bull)' : 'var(--bear)'
                  const sentColor = a.sentiment === 'bullish' ? 'var(--bull)' : 'var(--bear)'
                  const isExp = expanded === i
                  return (
                    <>
                      <tr key={i} style={{ cursor: 'pointer' }}
                        onClick={() => setExpanded(isExp ? null : i)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => !isExp && (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                          <span style={{ color: typeColor, fontWeight: 700, fontSize: 11 }}>
                            {a.type === 'call' ? '🟢' : '🔴'} {a.type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', fontWeight: 700 }}>${a.strike}</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', color: 'var(--muted)' }}>{a.expiration_label}</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', color: 'var(--muted)' }}>{a.dte}d</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', color: typeColor, fontWeight: 600 }}>{a.volume?.toLocaleString()}</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', color: 'var(--muted)' }}>{a.oi?.toLocaleString()}</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', fontWeight: 700, color: a.vol_oi_ratio > 5 ? 'var(--gold)' : 'var(--text)' }}>
                          {a.vol_oi_ratio ?? '—'}×
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>{a.iv_pct ?? '—'}%</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)', fontWeight: 700 }}>{fmtPrem(a.premium_value)}</td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                          <span style={{ color: sentColor, fontWeight: 700, fontSize: 11 }}>
                            {a.sentiment === 'bullish' ? '⬆ Bullish' : '⬇ Bearish'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                          <ScoreBar score={a.score} />
                        </td>
                      </tr>
                      {isExp && (
                        <tr key={`exp-${i}`}>
                          <td colSpan={11} style={{ padding: '0 10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, padding: '10px 12px', borderLeft: '3px solid ' + typeColor, borderRadius: '0 6px 6px 0' }}>
                              💡 <strong style={{ color: 'var(--text)' }}>What this means in plain English:</strong> {whatItMeans(a)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && data && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No unusual activity found for current filter. Try lowering the threshold or expanding expirations.
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Unusual score</strong> = weighted combination of Vol/OI ratio (40%), total premium value (40%), and IV elevation (20%).
        Contracts with Vol/OI {'>'} 1.5× or premium {'>'} $100K are surfaced. High scores suggest institutional or algorithmic directional positioning.
      </div>
    </div>
  )
}
