import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtVol = (v) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : '+'
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`
  return `${sign}${abs}`
}
const fmtPrice = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)
const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

const BULL = '#10b981'
const BEAR = '#ef4444'
const DIM  = '#64748b'

function CumDeltaChart({ bars }) {
  if (!bars?.length) return null
  const W = 760, H = 100, ML = 64, MR = 10, MT = 8, MB = 18
  const cW = W - ML - MR, cH = H - MT - MB
  const deltas = bars.map(b => b.cum_delta)
  const dMin = Math.min(...deltas, 0)
  const dMax = Math.max(...deltas, 0)
  const dRange = dMax - dMin || 1
  const xS = (i) => ML + (i / Math.max(bars.length - 1, 1)) * cW
  const yS = (d) => MT + (1 - (d - dMin) / dRange) * cH
  const zeroY = yS(0)
  const pts = bars.map((b, i) => [xS(i), yS(b.cum_delta)])
  const clamp = (y, above) => above ? Math.min(y, zeroY) : Math.max(y, zeroY)
  const fillPath = (above) => {
    if (pts.length < 2) return ''
    const pp = pts.map(([x, y]) => `${x},${clamp(y, above)}`).join(' L')
    return `M${pts[0][0]},${zeroY} L${pp} L${pts[pts.length - 1][0]},${zeroY} Z`
  }
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const last = deltas[deltas.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <line x1={ML} y1={zeroY} x2={W - MR} y2={zeroY} stroke="#2a3a5c" strokeWidth="1" />
      <path d={fillPath(true)}  fill="rgba(16,185,129,0.2)" />
      <path d={fillPath(false)} fill="rgba(239,68,68,0.2)" />
      <path d={linePath} fill="none" stroke={last >= 0 ? BULL : BEAR} strokeWidth="1.5" />
      {[dMax, 0, dMin].map((v, i) => (
        <text key={i} x={ML - 4} y={yS(v) + 4} fill={DIM} fontSize="9" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          {fmtVol(v)}
        </text>
      ))}
      {[0, Math.floor(bars.length / 2), bars.length - 1].map((i) => {
        const b = bars[i]; if (!b) return null
        return (
          <text key={i} x={xS(i)} y={H - 3} fill={DIM} fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
            {fmtTime(b.time)}
          </text>
        )
      })}
    </svg>
  )
}

const TF_OPTIONS = [
  { key: '1d', label: 'Today (1m)' },
  { key: '2d', label: '2 Days (2m)' },
  { key: '5d', label: '5 Days (5m)' },
]

export default function TapeView() {
  const { ticker: globalTicker } = useStore()
  const [ticker, setTicker] = useState(globalTicker || 'SPY')
  const [tf, setTf]         = useState('1d')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [showAll, setShowAll] = useState(false)

  async function load() {
    if (!ticker.trim()) return
    setLoading(true); setError(null)
    try {
      const d = await api.get(`/order_flow/tape/${ticker.trim().toUpperCase()}?timeframe=${tf}`)
      setData(d)
      setShowAll(false)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const s = data?.summary
  const bars = data?.bars ?? []
  const displayBars = showAll ? [...bars].reverse() : [...bars].reverse().slice(0, 50)

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-sm" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Order Flow Tape</strong> — per-bar buy/sell
        volume estimated from price position within each candle's range.{' '}
        <strong style={{ color: BULL }}>Green delta</strong> = more volume traded at the ask (buyers
        aggressive). <strong style={{ color: BEAR }}>Red delta</strong> = more volume at bid (sellers
        aggressive). 🐳 = large print (&gt;2× avg vol). 🧲 = absorption (high vol, tight range).
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Ticker"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13, width: 120, outline: 'none' }}
        />
        <select value={tf} onChange={e => setTf(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {TF_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 110 }}>
          {loading ? 'Loading…' : 'Load Tape'}
        </button>
        {s && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{bars.length} bars</span>}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Fetching tape…</span></div>}

      {s && (
        <>
          <div className="card-grid-4" style={{ gap: 10 }}>
            {[
              { label: 'Cumulative Delta', value: fmtVol(s.cum_delta), color: s.cum_delta >= 0 ? BULL : BEAR, sub: s.bias.toUpperCase() },
              { label: 'Buy Volume',  value: fmtVol(s.buy_volume),   color: BULL, sub: `${Math.round(s.buy_volume / s.total_volume * 100)}% of session` },
              { label: 'Sell Volume', value: fmtVol(s.sell_volume),  color: BEAR, sub: `${Math.round(s.sell_volume / s.total_volume * 100)}% of session` },
              { label: 'VWAP / Spot', value: fmtPrice(s.vwap), color: s.spot >= s.vwap ? BULL : BEAR,
                sub: `Spot ${fmtPrice(s.spot)} ${s.spot >= s.vwap ? '▲ above' : '▼ below'} VWAP` },
            ].map(c => (
              <div key={c.label} className="card card-sm">
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="card card-sm" style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <span>🐳 Large prints: <strong style={{ color: '#f59e0b' }}>{s.large_print_count}</strong></span>
            <span>🧲 Absorptions: <strong style={{ color: '#c084fc' }}>{s.absorption_count}</strong></span>
          </div>

          <div className="card" style={{ padding: '12px 10px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>Cumulative Delta</div>
            <CumDeltaChart bars={bars} />
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {['Time', 'Close', 'Volume', 'Buy Vol', 'Sell Vol', 'Delta', 'Cum Δ', 'Flags'].map(h => (
                    <th key={h} style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayBars.map((b, i) => {
                  const bull = b.delta >= 0
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: b.is_large_print ? 'rgba(245,158,11,0.05)' : b.is_absorption ? 'rgba(192,132,252,0.04)' : 'transparent',
                    }}>
                      <td style={{ padding: '5px 10px', color: DIM, textAlign: 'right' }}>{fmtTime(b.time)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: b.candle_type === 'bull' ? BULL : BEAR }}>{fmtPrice(b.close)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text)' }}>{b.volume.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: BULL }}>{b.buy_vol.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: BEAR }}>{b.sell_vol.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: bull ? BULL : BEAR, fontWeight: 600 }}>
                        {bull ? '+' : ''}{b.delta.toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: b.cum_delta >= 0 ? BULL : BEAR }}>
                        {b.cum_delta >= 0 ? '+' : ''}{b.cum_delta.toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                        {b.is_large_print && <span title="Large print">🐳</span>}
                        {b.is_absorption && <span title="Absorption">🧲</span>}
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
        </>
      )}
    </div>
  )
}
