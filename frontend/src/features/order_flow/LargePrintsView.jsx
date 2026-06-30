import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtPrice = (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`
const fmtVol   = (v) => { if (v == null) return '—'; const a = Math.abs(v); return a >= 1e6 ? `${(a/1e6).toFixed(2)}M` : a >= 1e3 ? `${(a/1e3).toFixed(1)}K` : String(a) }
const fmtTime  = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

const BULL = '#10b981'
const BEAR = '#ef4444'
const DIM  = '#475569'

// Horizontal bar showing buy vs sell split for a single print
function BuySellBar({ buy_vol, sell_vol }) {
  const total  = buy_vol + sell_vol || 1
  const buyPct = buy_vol / total * 100
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 80 }}>
      <div style={{ width: `${buyPct}%`, background: BULL }} />
      <div style={{ flex: 1, background: BEAR }} />
    </div>
  )
}

// Zone card for a cluster
function ZoneCard({ cluster }) {
  const isDemand = cluster.type === 'demand'
  const total = cluster.buy_vol + cluster.sell_vol || 1
  const buyPct = Math.round(cluster.buy_vol / total * 100)
  return (
    <div className="card card-sm" style={{ borderLeft: `3px solid ${isDemand ? BULL : BEAR}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
            {isDemand ? '🟢 DEMAND ZONE' : '🔴 SUPPLY ZONE'} · {cluster.count} print{cluster.count > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: isDemand ? BULL : BEAR, fontFamily: 'JetBrains Mono,monospace' }}>
            {fmtPrice(cluster.price_low)}{cluster.price_low !== cluster.price_high ? ` – ${fmtPrice(cluster.price_high)}` : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {buyPct}% buy · Net delta {cluster.net_delta > 0 ? '+' : ''}{fmtVol(cluster.net_delta)}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
          <div>Total vol</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtVol(cluster.buy_vol + cluster.sell_vol)}</div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${buyPct}%`, background: BULL }} />
          <div style={{ flex: 1, background: BEAR }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
        {isDemand
          ? `Institutions were buying here. If price revisits ${fmtPrice(cluster.price_low)}, buyers may step in again.`
          : `Institutions were selling here. If price revisits ${fmtPrice(cluster.price_high)}, sellers may step in again.`}
      </div>
    </div>
  )
}

// Timeline SVG — dots at each print's time position, sized by volume
function TimelineChart({ prints }) {
  if (!prints?.length) return null
  const W = 760, H = 60, ML = 10, MR = 10, MT = 10, MB = 10
  const cW = W - ML - MR
  const times = prints.map(p => new Date(p.time).getTime())
  const tMin = Math.min(...times), tMax = Math.max(...times), tRange = tMax - tMin || 1
  const maxMult = Math.max(...prints.map(p => p.vol_multiple), 1)
  const xS = (t) => ML + ((t - tMin) / tRange) * cW
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <line x1={ML} y1={H/2} x2={W-MR} y2={H/2} stroke="#1e293b" strokeWidth="1" />
      {prints.map((p, i) => {
        const x = xS(new Date(p.time).getTime())
        const r = Math.max(4, (p.vol_multiple / maxMult) * 14)
        const bull = p.candle_type === 'bull'
        return (
          <g key={i}>
            <circle cx={x} cy={H/2} r={r}
              fill={p.is_absorption ? 'rgba(192,132,252,0.8)' : bull ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'}
              stroke={p.is_absorption ? '#c084fc' : bull ? BULL : BEAR} strokeWidth="1" />
          </g>
        )
      })}
      {/* Time labels */}
      {[prints[0], prints[Math.floor(prints.length/2)], prints[prints.length-1]].filter(Boolean).map((p, i) => (
        <text key={i} x={xS(new Date(p.time).getTime())} y={H-1} fill={DIM} fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono,monospace">
          {fmtTime(p.time)}
        </text>
      ))}
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
      setData(await api.get(`/order_flow/large_prints/${ticker.trim().toUpperCase()}?timeframe=${tf}&threshold=${threshold}`))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const prints   = data?.prints   ?? []
  const clusters = data?.clusters ?? []
  const demandClusters = clusters.filter(c => c.type === 'demand').sort((a,b) => b.count - a.count)
  const supplyClusters = clusters.filter(c => c.type === 'supply').sort((a,b) => b.count - a.count)
  const bullPrints = prints.filter(p => p.candle_type === 'bull')
  const bearPrints = prints.filter(p => p.candle_type === 'bear')

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
        <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {[1.5, 2, 2.5, 3, 4, 5].map(v => <option key={v} value={v}>{v}× avg vol</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 120 }}>
          {loading ? 'Scanning…' : 'Scan Prints'}
        </button>
        {data && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{data.count} prints found</span>}
      </div>

      {error  && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Scanning tape…</span></div>}

      {data && prints.length === 0 && (
        <div className="card card-sm" style={{ color: 'var(--muted)', fontSize: 13 }}>{data.reading}</div>
      )}

      {data && prints.length > 0 && <>

        {/* Reading */}
        <div className="card card-sm" style={{ borderLeft: '3px solid #f59e0b', fontSize: 13, lineHeight: 1.7, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>READING</div>
          {data.reading}
        </div>

        {/* Stats row */}
        <div className="card-grid-4" style={{ gap: 10 }}>
          {[
            { label: 'Total Prints',   value: data.count,        color: '#f59e0b', sub: `≥ ${threshold}× avg vol` },
            { label: 'Bull Prints',    value: bullPrints.length, color: BULL,      sub: 'Buyer-aggressive' },
            { label: 'Bear Prints',    value: bearPrints.length, color: BEAR,      sub: 'Seller-aggressive' },
            { label: 'Absorptions',    value: prints.filter(p => p.is_absorption).length, color: '#c084fc', sub: 'Big vol, tight range' },
          ].map(c => (
            <div key={c.label} className="card card-sm">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono,monospace' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="card" style={{ padding: '12px 10px 4px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>
            Print Timeline — circle size = volume multiple · 🟢 bull print · 🔴 bear print · 🟣 absorption
          </div>
          <TimelineChart prints={prints} />
        </div>

        {/* Supply / Demand Zones */}
        {clusters.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>KEY ZONES (clustered prints = institutional interest)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: BULL, fontWeight: 600 }}>DEMAND ZONES</div>
                {demandClusters.length ? demandClusters.map((c,i) => <ZoneCard key={i} cluster={c} />)
                  : <div className="card card-sm" style={{ fontSize: 12, color: 'var(--muted)' }}>No demand clusters detected</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: BEAR, fontWeight: 600 }}>SUPPLY ZONES</div>
                {supplyClusters.length ? supplyClusters.map((c,i) => <ZoneCard key={i} cluster={c} />)
                  : <div className="card card-sm" style={{ fontSize: 12, color: 'var(--muted)' }}>No supply clusters detected</div>}
              </div>
            </div>
          </div>
        )}

        {/* Raw Prints Table */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 12px 6px', borderBottom: '1px solid var(--border)' }}>
            All prints — sorted newest first
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}>
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                {['Time', 'Price', 'Volume', 'Size', 'Buy ← → Sell', 'Net Delta', 'Type'].map((h,i) => (
                  <th key={i} style={{ textAlign: i < 4 ? 'right' : 'center', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
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
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: bull ? BULL : BEAR, fontWeight: 600 }}>{fmtPrice(p.price)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{p.volume.toLocaleString()}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{p.vol_multiple.toFixed(1)}×</td>
                    <td style={{ padding: '5px 14px' }}><BuySellBar buy_vol={p.buy_vol} sell_vol={p.sell_vol} /></td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: p.delta >= 0 ? BULL : BEAR, fontWeight: 600 }}>
                      {p.delta >= 0 ? '+' : ''}{fmtVol(p.delta)}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        background: p.is_absorption ? 'rgba(192,132,252,0.2)' : bull ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: p.is_absorption ? '#c084fc' : bull ? BULL : BEAR }}>
                        {p.is_absorption ? '🧲 ABSORB' : bull ? '▲ BULL' : '▼ BEAR'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
