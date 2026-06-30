import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtPrice = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)
const fmtVol   = (v) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`
  return String(abs)
}
const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

const BULL = '#10b981'
const BEAR = '#ef4444'
const DIM  = '#64748b'

function TimelineChart({ prints }) {
  if (!prints?.length) return null
  const W = 760, H = 80, ML = 10, MR = 10, MT = 8, MB = 8
  const cW = W - ML - MR, cH = H - MT - MB
  const maxMult = Math.max(...prints.map(p => p.vol_multiple), 1)
  const times = prints.map(p => new Date(p.time).getTime())
  const tMin = Math.min(...times), tMax = Math.max(...times)
  const tRange = tMax - tMin || 1
  const xS = (t) => ML + ((t - tMin) / tRange) * cW
  const yS = (m) => MT + (1 - m / maxMult) * cH
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <line x1={ML} y1={MT + cH} x2={W - MR} y2={MT + cH} stroke="#2a3a5c" strokeWidth="1" />
      {prints.map((p, i) => {
        const x = xS(new Date(p.time).getTime())
        const h = (p.vol_multiple / maxMult) * cH
        const bull = p.candle_type === 'bull'
        return (
          <rect key={i} x={x - 3} y={MT + cH - h} width={6} height={Math.max(h, 3)}
            fill={bull ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'}
            rx="1"
          />
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

export default function LargePrintsView() {
  const { ticker: globalTicker } = useStore()
  const [ticker, setTicker]     = useState(globalTicker || 'SPY')
  const [tf, setTf]             = useState('1d')
  const [threshold, setThreshold] = useState(2.0)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function load() {
    if (!ticker.trim()) return
    setLoading(true); setError(null)
    try {
      const d = await api.get(
        `/order_flow/large_prints/${ticker.trim().toUpperCase()}?timeframe=${tf}&threshold=${threshold}`
      )
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const prints = data?.prints ?? []
  const bullPrints = prints.filter(p => p.candle_type === 'bull')
  const bearPrints = prints.filter(p => p.candle_type === 'bear')
  const totalBuyVol  = bullPrints.reduce((s, p) => s + p.buy_vol, 0)
  const totalSellVol = bearPrints.reduce((s, p) => s + p.sell_vol, 0)

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-sm" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Large Print Scanner</strong> — surfaces bars where
        volume exceeds the threshold multiple of the rolling 20-bar average. These are the blocks
        institutions and large participants leave in the tape. Clustered large prints in one direction
        signal commitment. 🧲 = absorption (high vol, narrow range — potential reversal zone).
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
        <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {[1.5, 2, 2.5, 3, 4, 5].map(v => (
            <option key={v} value={v}>{v}× avg vol</option>
          ))}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 120 }}>
          {loading ? 'Scanning…' : 'Scan Prints'}
        </button>
        {data && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{data.count} prints found</span>}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Scanning tape…</span></div>}

      {data && prints.length === 0 && (
        <div className="card card-sm" style={{ color: 'var(--muted)', fontSize: 13 }}>
          No prints above {threshold}× average volume in this window.
        </div>
      )}

      {data && prints.length > 0 && (
        <>
          <div className="card-grid-4" style={{ gap: 10 }}>
            {[
              { label: 'Total Prints',    value: data.count,             color: '#f59e0b', sub: `≥ ${threshold}× avg vol` },
              { label: 'Bull Prints',     value: bullPrints.length,      color: BULL,      sub: `Buy vol: ${fmtVol(totalBuyVol)}` },
              { label: 'Bear Prints',     value: bearPrints.length,      color: BEAR,      sub: `Sell vol: ${fmtVol(totalSellVol)}` },
              { label: 'Absorptions',     value: prints.filter(p => p.is_absorption).length, color: '#c084fc', sub: 'High vol + tight range' },
            ].map(c => (
              <div key={c.label} className="card card-sm">
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '12px 10px 6px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>Print Timeline (bar height = volume multiple)</div>
            <TimelineChart prints={prints} />
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {['Time', 'Price', 'Volume', 'Vol Multiple', 'Buy Vol', 'Sell Vol', 'Delta', 'Type'].map(h => (
                    <th key={h} style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...prints].reverse().map((p, i) => {
                  const bull = p.candle_type === 'bull'
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: p.is_absorption ? 'rgba(192,132,252,0.06)' : bull ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
                    }}>
                      <td style={{ padding: '5px 10px', color: DIM, textAlign: 'right' }}>{fmtTime(p.time)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: bull ? BULL : BEAR }}>{fmtPrice(p.price)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text)' }}>{p.volume.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{p.vol_multiple.toFixed(1)}×</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: BULL }}>{p.buy_vol.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: BEAR }}>{p.sell_vol.toLocaleString()}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: p.delta >= 0 ? BULL : BEAR, fontWeight: 600 }}>
                        {p.delta >= 0 ? '+' : ''}{p.delta.toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          background: p.is_absorption ? 'rgba(192,132,252,0.2)' : bull ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: p.is_absorption ? '#c084fc' : bull ? BULL : BEAR,
                        }}>
                          {p.is_absorption ? '🧲 ABSORB' : bull ? '▲ BULL' : '▼ BEAR'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
