import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtVol = (v) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : '+'
  if (abs >= 1e9) return `${sign}${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${(abs/1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs/1e3).toFixed(0)}K`
  return `${sign}${abs}`
}
const fmtPrice = (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`

const TIMEFRAMES = [
  { key: '1d',  label: 'Intraday (1m)' },
  { key: '5d',  label: '5 Days (5m)' },
  { key: '1mo', label: '1 Month (1h)' },
  { key: '3mo', label: '3 Months' },
  { key: '6mo', label: '6 Months' },
  { key: '1y',  label: '1 Year' },
]

// ─── Price + VWAP line chart ────────────────────────────────────────────────

function PriceChart({ bars, vwap }) {
  if (!bars?.length) return null
  const W = 760, H = 130, ML = 60, MR = 10, MT = 10, MB = 20
  const cW = W - ML - MR
  const cH = H - MT - MB

  const closes = bars.map(b => b.close)
  const vwaps  = bars.map(b => b.vwap)
  const allPrices = [...closes, ...vwaps]
  const pMin = Math.min(...allPrices)
  const pMax = Math.max(...allPrices)
  const pRange = pMax - pMin || 1

  const xS = (i) => ML + (i / Math.max(bars.length - 1, 1)) * cW
  const yS = (p) => MT + (1 - (p - pMin) / pRange) * cH

  const closePath = bars.map((b, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(b.close)}`).join(' ')
  const vwapPath  = bars.map((b, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(b.vwap)}`).join(' ')

  const spot = closes[closes.length - 1]
  const spotAboveVwap = spot >= (vwaps[vwaps.length - 1] || spot)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Price line */}
      <path d={closePath} fill="none"
        stroke={spotAboveVwap ? '#10b981' : '#ef4444'} strokeWidth="1.5" />

      {/* VWAP line */}
      <path d={vwapPath} fill="none"
        stroke="#06b6d4" strokeWidth="1.2" strokeDasharray="4,2" />

      {/* Y axis labels */}
      {[pMax, (pMax + pMin) / 2, pMin].map((p, i) => (
        <text key={i} x={ML - 4} y={yS(p) + 4}
          fill="#64748b" fontSize="10" textAnchor="end"
          fontFamily="JetBrains Mono, monospace">
          {p.toFixed(2)}
        </text>
      ))}

      {/* Legend */}
      <line x1={ML} y1={H - 6} x2={ML + 16} y2={H - 6} stroke={spotAboveVwap ? '#10b981' : '#ef4444'} strokeWidth="1.5" />
      <text x={ML + 20} y={H - 3} fill="#64748b" fontSize="10">Price</text>
      <line x1={ML + 60} y1={H - 6} x2={ML + 76} y2={H - 6} stroke="#06b6d4" strokeWidth="1.2" strokeDasharray="4,2" />
      <text x={ML + 80} y={H - 3} fill="#64748b" fontSize="10">VWAP</text>
    </svg>
  )
}

// ─── Cumulative delta area chart ────────────────────────────────────────────

function DeltaChart({ bars }) {
  if (!bars?.length) return null
  const W = 760, H = 220, ML = 72, MR = 10, MT = 15, MB = 25
  const cW = W - ML - MR
  const cH = H - MT - MB

  const deltas = bars.map(b => b.cum_delta)
  const dMin = Math.min(...deltas, 0)
  const dMax = Math.max(...deltas, 0)
  const dRange = dMax - dMin || 1

  const xS = (i) => ML + (i / Math.max(bars.length - 1, 1)) * cW
  const yS = (d) => MT + (1 - (d - dMin) / dRange) * cH
  const zeroY = yS(0)

  // Build area paths: above zero (bull) and below zero (bear)
  const pts = bars.map((b, i) => [xS(i), yS(b.cum_delta)])

  const makeFill = (pts, clampAbove) => {
    if (pts.length < 2) return ''
    const clampY = (y) => clampAbove ? Math.min(y, zeroY) : Math.max(y, zeroY)
    const pathPts = pts.map(([x, y]) => `${x},${clampY(y)}`).join(' L')
    return `M${pts[0][0]},${zeroY} L${pathPts} L${pts[pts.length-1][0]},${zeroY} Z`
  }

  const bullFill = makeFill(pts, true)   // area above zero
  const bearFill = makeFill(pts, false)  // area below zero
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')

  // Y axis labels
  const yLabels = [dMax, 0, dMin].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Zero line */}
      <line x1={ML} y1={zeroY} x2={W - MR} y2={zeroY}
        stroke="#2a3a5c" strokeWidth="1" />
      <text x={ML - 4} y={zeroY + 4} fill="#64748b" fontSize="10" textAnchor="end"
        fontFamily="JetBrains Mono, monospace">0</text>

      {/* Fill areas */}
      <path d={bullFill} fill="rgba(16,185,129,0.25)" />
      <path d={bearFill} fill="rgba(239,68,68,0.25)" />

      {/* Cumulative delta line */}
      <path d={linePath} fill="none"
        stroke={deltas[deltas.length - 1] >= 0 ? '#10b981' : '#ef4444'}
        strokeWidth="1.5" />

      {/* Y axis labels */}
      {yLabels.map((v) => {
        const y = yS(v)
        if (Math.abs(y - zeroY) < 8 && v !== 0) return null
        return (
          <text key={v} x={ML - 4} y={y + 4}
            fill="#64748b" fontSize="10" textAnchor="end"
            fontFamily="JetBrains Mono, monospace">
            {fmtVol(v)}
          </text>
        )
      })}

      {/* X-axis time labels (first, middle, last) */}
      {[0, Math.floor(bars.length / 2), bars.length - 1].map((i) => {
        const b = bars[i]
        if (!b) return null
        const x = xS(i)
        const label = new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return (
          <text key={i} x={x} y={H - 5}
            fill="#64748b" fontSize="10" textAnchor="middle"
            fontFamily="JetBrains Mono, monospace">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Per-bar delta bar chart (compact) ─────────────────────────────────────

function BarDeltaChart({ bars }) {
  if (!bars?.length) return null
  const W = 760, H = 80, ML = 72, MR = 10, MT = 5, MB = 5
  const cW = W - ML - MR
  const cH = H - MT - MB

  const rawDeltas = bars.map(b => b.delta)
  const maxAbs = Math.max(...rawDeltas.map(Math.abs), 1)

  const barW = Math.max(1, cW / bars.length - 0.5)
  const midY = MT + cH / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <line x1={ML} y1={midY} x2={W - MR} y2={midY}
        stroke="#2a3a5c" strokeWidth="0.5" />
      {bars.map((b, i) => {
        const x = ML + (i / bars.length) * cW
        const h = Math.abs(b.delta) / maxAbs * (cH / 2)
        const bullish = b.delta >= 0
        return (
          <rect key={i} x={x} y={bullish ? midY - h : midY}
            width={barW} height={Math.max(h, 0.5)}
            fill={bullish ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'}
          />
        )
      })}
      <text x={ML - 4} y={MT + 9} fill="#64748b" fontSize="9" textAnchor="end">+Δ</text>
      <text x={ML - 4} y={H - MB + 2} fill="#64748b" fontSize="9" textAnchor="end">−Δ</text>
    </svg>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────

export default function DeltaFlowView() {
  const { ticker: globalTicker } = useStore()
  const [ticker, setTicker]   = useState(globalTicker)
  const [tf, setTf]           = useState('5d')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  async function load() {
    if (!ticker.trim()) return
    setLoading(true); setError(null)
    try {
      const d = await api.get(`/volume_profile/delta/${ticker.trim().toUpperCase()}?timeframe=${tf}`)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const cumDelta = data?.cum_delta ?? 0
  const bullish  = cumDelta >= 0

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Guide */}
      <div className="card card-sm" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Δ Delta Flow</strong> — tracks the{' '}
        <em>net buying vs selling pressure</em> bar by bar. Each bar's volume is split
        into estimated buy (price closed near high) and sell (price closed near low).{' '}
        <strong style={{ color: 'var(--bull)' }}>Rising cumulative delta</strong> = persistent buying
        pressure. <strong style={{ color: 'var(--bear)' }}>Falling cumulative delta</strong> = sellers
        are in control. Divergence between price and delta often precedes reversals.
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Ticker (e.g. AAPL)"
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13,
            width: 140, outline: 'none',
          }}
        />
        <select
          value={tf} onChange={e => setTf(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}
        >
          {TIMEFRAMES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 110 }}>
          {loading ? 'Loading…' : 'Load Delta'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
            {data.ticker} · {data.timeframe} · {data.bars.length} bars
          </span>
        )}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Calculating delta…</span></div>}

      {/* Summary cards */}
      {data && (
        <div className="card-grid-4" style={{ gap: 10 }}>
          {[
            {
              label: 'Net Cumulative Delta',
              value: fmtVol(cumDelta),
              color: bullish ? 'var(--bull-hi)' : 'var(--bear-hi)',
              sub: bullish ? '▲ Net buying pressure' : '▼ Net selling pressure',
            },
            {
              label: 'Buy Volume',
              value: fmtVol(data.buy_volume),
              color: 'var(--bull)',
              sub: `${Math.round(data.buy_volume / (data.buy_volume + data.sell_volume) * 100)}% of total`,
            },
            {
              label: 'Sell Volume',
              value: fmtVol(data.sell_volume),
              color: 'var(--bear)',
              sub: `${Math.round(data.sell_volume / (data.buy_volume + data.sell_volume) * 100)}% of total`,
            },
            {
              label: 'VWAP vs Spot',
              value: fmtPrice(data.vwap),
              color: data.spot >= data.vwap ? 'var(--bull)' : 'var(--bear)',
              sub: data.spot >= data.vwap
                ? `Spot ${fmtPrice(data.spot)} ▲ above VWAP`
                : `Spot ${fmtPrice(data.spot)} ▼ below VWAP`,
            },
          ].map(c => (
            <div key={c.label} className="card card-sm">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {data && (
        <>
          <div className="card" style={{ padding: '12px 10px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>
              Price vs VWAP
            </div>
            <PriceChart bars={data.bars} vwap={data.vwap} />
          </div>

          <div className="card" style={{ padding: '12px 10px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>
              Cumulative Delta (buy − sell volume)
            </div>
            <DeltaChart bars={data.bars} />
          </div>

          <div className="card" style={{ padding: '12px 10px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 6 }}>
              Per-bar Delta
            </div>
            <BarDeltaChart bars={data.bars} />
          </div>

          {/* Divergence callout */}
          {(() => {
            const n = data.bars.length
            if (n < 10) return null
            const recentBars = data.bars.slice(-Math.floor(n * 0.2))
            const firstClose = recentBars[0].close
            const lastClose  = recentBars[recentBars.length - 1].close
            const firstDelta = recentBars[0].cum_delta
            const lastDelta  = recentBars[recentBars.length - 1].cum_delta
            const priceUp    = lastClose > firstClose
            const deltaUp    = lastDelta > firstDelta
            const diverging  = priceUp !== deltaUp

            if (!diverging) return null
            return (
              <div className="card card-sm" style={{ borderLeft: '3px solid var(--accent-purple)', fontSize: 13, lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--accent-purple)' }}>⚠ Divergence detected</strong> —
                price is {priceUp ? 'rising' : 'falling'} but cumulative delta is {deltaUp ? 'rising' : 'falling'}.{' '}
                {priceUp && !deltaUp
                  ? 'Price rising on declining buy pressure — potential distribution / exhaustion.'
                  : 'Price falling but buyers are stepping in — potential accumulation / reversal setup.'}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
