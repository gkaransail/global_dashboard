import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtVol   = (v) => { if (v == null) return '—'; const a = Math.abs(v), s = v < 0 ? '-' : '+'; return a >= 1e6 ? `${s}${(a/1e6).toFixed(1)}M` : a >= 1e3 ? `${s}${(a/1e3).toFixed(0)}K` : `${s}${a}` }
const fmtPrice = (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`
const fmtTime  = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

const BULL = '#10b981'
const BEAR = '#ef4444'
const DIM  = '#475569'

// OFI colour: green above 60, red below 40, amber in between
const ofiColor = (pct) => pct >= 60 ? BULL : pct <= 40 ? BEAR : '#f59e0b'
const ofiLabel = (pct) => pct >= 60 ? 'BUY' : pct <= 40 ? 'SELL' : 'NEUT'

function CumDeltaChart({ bars }) {
  if (!bars?.length) return null
  const W = 760, H = 160, ML = 68, MR = 10, MT = 12, MB = 22
  const cW = W - ML - MR, cH = H - MT - MB
  const deltas = bars.map(b => b.cum_delta)
  const dMin = Math.min(...deltas, 0), dMax = Math.max(...deltas, 0)
  const dRange = dMax - dMin || 1
  const xS = (i) => ML + (i / Math.max(bars.length - 1, 1)) * cW
  const yS = (d) => MT + (1 - (d - dMin) / dRange) * cH
  const zeroY = yS(0)
  const pts = bars.map((b, i) => [xS(i), yS(b.cum_delta)])
  const clamp = (y, above) => above ? Math.min(y, zeroY) : Math.max(y, zeroY)
  const fill = (above) => {
    if (pts.length < 2) return ''
    const pp = pts.map(([x, y]) => `${x},${clamp(y, above)}`).join(' L')
    return `M${pts[0][0]},${zeroY} L${pp} L${pts[pts.length-1][0]},${zeroY} Z`
  }
  const line = pts.map(([x,y], i) => `${i===0?'M':'L'}${x},${y}`).join(' ')
  const last = deltas[deltas.length-1]

  // Grid lines
  const gridVals = [dMax, dMax/2, 0, dMin/2, dMin].filter(v => !isNaN(v))
  const timeLabels = [0, Math.floor(bars.length/4), Math.floor(bars.length/2), Math.floor(bars.length*3/4), bars.length-1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Grid */}
      {gridVals.map((v,i) => (
        <line key={i} x1={ML} y1={yS(v)} x2={W-MR} y2={yS(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}
      {/* Zero line */}
      <line x1={ML} y1={zeroY} x2={W-MR} y2={zeroY} stroke="#2a3a5c" strokeWidth="1.5" />
      {/* Fill */}
      <path d={fill(true)}  fill="rgba(16,185,129,0.15)" />
      <path d={fill(false)} fill="rgba(239,68,68,0.15)" />
      {/* Line */}
      <path d={line} fill="none" stroke={last >= 0 ? BULL : BEAR} strokeWidth="2" />
      {/* Y labels */}
      {[dMax, 0, dMin].map((v,i) => (
        <text key={i} x={ML-5} y={yS(v)+4} fill={DIM} fontSize="10" textAnchor="end" fontFamily="JetBrains Mono,monospace">{fmtVol(v)}</text>
      ))}
      {/* X time labels */}
      {timeLabels.map(i => {
        const b = bars[i]; if (!b) return null
        return <text key={i} x={xS(i)} y={H-5} fill={DIM} fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono,monospace">{fmtTime(b.time)}</text>
      })}
    </svg>
  )
}

// Visual buy/sell split bar + OFI%
function OFIBar({ ofi_pct }) {
  const buy = ofi_pct
  const sell = 100 - ofi_pct
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
      <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(239,68,68,0.25)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${buy}%`, background: ofiColor(buy), borderRadius: 5, transition: 'width 0.2s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono,monospace', color: ofiColor(buy), minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
        {ofiLabel(buy)}
      </span>
    </div>
  )
}

const TF_OPTIONS = [
  { key: '1d', label: 'Today (1m)' },
  { key: '2d', label: '2 Days (2m)' },
  { key: '5d', label: '5 Days (5m)' },
]

export default function TapeView() {
  const { ticker: globalTicker } = useStore()
  const [ticker, setTicker]   = useState(globalTicker || 'SPY')
  const [tf, setTf]           = useState('1d')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [showAll, setShowAll] = useState(false)

  async function load() {
    if (!ticker.trim()) return
    setLoading(true); setError(null)
    try {
      setData(await api.get(`/order_flow/tape/${ticker.trim().toUpperCase()}?timeframe=${tf}`))
      setShowAll(false)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const s = data?.summary
  const bars = data?.bars ?? []
  const displayBars = (showAll ? [...bars] : [...bars].slice(-50)).reverse()

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Ticker" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13, width: 120, outline: 'none' }} />
        <select value={tf} onChange={e => setTf(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {TF_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 110 }}>
          {loading ? 'Loading…' : 'Load Tape'}
        </button>
        {s && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{bars.length} bars · last bar {fmtTime(bars[bars.length-1]?.time)}</span>}
      </div>

      {error  && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Fetching tape…</span></div>}

      {s && <>

        {/* Plain English Reading */}
        <div className="card card-sm" style={{ borderLeft: `3px solid ${s.bias === 'bullish' ? BULL : s.bias === 'bearish' ? BEAR : '#f59e0b'}`, fontSize: 13, lineHeight: 1.7, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>READING</div>
          {s.reading}
        </div>

        {/* Key Stats */}
        <div className="card-grid-4" style={{ gap: 10 }}>
          {[
            {
              label: 'Net Delta (Bias)',
              value: fmtVol(s.cum_delta),
              color: s.cum_delta >= 0 ? BULL : BEAR,
              sub: s.bias === 'bullish' ? 'More buyers than sellers' : s.bias === 'bearish' ? 'More sellers than buyers' : 'Balanced',
            },
            {
              label: 'Buy / Sell Split',
              value: `${Math.round(s.buy_volume / s.total_volume * 100)}% buy`,
              color: ofiColor(s.buy_volume / s.total_volume * 100),
              sub: `${fmtVol(s.buy_volume)} buy · ${fmtVol(s.sell_volume)} sell`,
            },
            {
              label: 'Delta Momentum',
              value: s.momentum_label || '—',
              color: s.momentum_direction === 'bullish' ? BULL : BEAR,
              sub: s.divergence ? `⚠ ${s.divergence} divergence` : 'No divergence',
            },
            {
              label: 'Spot vs VWAP',
              value: fmtPrice(s.spot),
              color: s.spot >= s.vwap ? BULL : BEAR,
              sub: `${s.spot >= s.vwap ? '▲ above' : '▼ below'} VWAP ${fmtPrice(s.vwap)}`,
            },
          ].map(c => (
            <div key={c.label} className="card card-sm">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono,monospace', textTransform: 'capitalize' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Events row */}
        {(s.large_print_count > 0 || s.absorption_count > 0) && (
          <div className="card card-sm" style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            {s.large_print_count > 0 && <span>🐳 <strong style={{ color: '#f59e0b' }}>{s.large_print_count}</strong> large prints — unusually big blocks of volume</span>}
            {s.absorption_count  > 0 && <span>🧲 <strong style={{ color: '#c084fc' }}>{s.absorption_count}</strong> absorption events — big vol, tiny price move</span>}
          </div>
        )}

        {/* Cumulative Delta Chart */}
        <div className="card" style={{ padding: '12px 10px 6px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2, paddingLeft: 6 }}>
            Cumulative Delta — <span style={{ color: 'var(--text)' }}>rising line = net buying pressure, falling line = net selling pressure</span>
          </div>
          <CumDeltaChart bars={bars} />
        </div>

        {/* Tape Table */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 12px 6px', borderBottom: '1px solid var(--border)' }}>
            Most recent bars first · <strong style={{ color: 'var(--text)' }}>OFI Bar</strong> shows % of volume that was buying (green = buyers aggressive, red = sellers aggressive)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}>
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                {['Time', 'Price', 'Volume', 'Buy ← OFI → Sell', 'Delta', 'Cum Δ', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i <= 2 ? 'right' : i === 3 ? 'center' : 'right', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayBars.map((b, i) => {
                const bullDelta = b.delta >= 0
                const rowBg = b.is_absorption ? 'rgba(192,132,252,0.06)' : b.is_large_print ? 'rgba(245,158,11,0.05)' : 'transparent'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: rowBg }}>
                    <td style={{ padding: '5px 10px', color: DIM, textAlign: 'right' }}>{fmtTime(b.time)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: b.candle_type === 'bull' ? BULL : BEAR, fontWeight: 600 }}>{fmtPrice(b.close)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text)' }}>
                      {b.vol_multiple >= 2 ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>{b.volume.toLocaleString()}</span> : b.volume.toLocaleString()}
                    </td>
                    <td style={{ padding: '5px 14px' }}>
                      <OFIBar ofi_pct={b.ofi_pct} />
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: bullDelta ? BULL : BEAR, fontWeight: 600 }}>
                      {bullDelta ? '+' : ''}{b.delta.toLocaleString()}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: b.cum_delta >= 0 ? BULL : BEAR }}>
                      {b.cum_delta >= 0 ? '+' : ''}{b.cum_delta.toLocaleString()}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: 13 }}>
                      {b.is_large_print && <span title="Large print — unusually big volume">🐳</span>}
                      {b.is_absorption  && <span title="Absorption — big vol, tight range">🧲</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {bars.length > 50 && !showAll && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <button onClick={() => setShowAll(true)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '5px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Show all {bars.length} bars
              </button>
            </div>
          )}
        </div>
      </>}
    </div>
  )
}
