import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtPrice = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)
const fmtVol = (v) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(0)}K`
  return String(abs)
}

const BULL = '#10b981'
const BEAR = '#ef4444'
const DIM  = '#64748b'

const TF_OPTIONS = [
  { key: '1d', label: 'Today (1m)' },
  { key: '2d', label: '2 Days (2m)' },
  { key: '5d', label: '5 Days (5m)' },
]

function FootprintChart({ levels, spot, pocPrice }) {
  if (!levels?.length) return null

  const maxTotal = Math.max(...levels.map(l => l.buy_vol + l.sell_vol), 1)
  const ROW_H = 22
  const BAR_MAX_W = 260
  const PRICE_COL = 72
  const VOL_COL   = 68
  const DELTA_COL = 72
  const GAP = 4
  const W = PRICE_COL + BAR_MAX_W + BAR_MAX_W + VOL_COL + DELTA_COL + GAP * 4
  const H = levels.length * ROW_H + 28

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', maxHeight: 600 }}>
      {/* Header */}
      {[
        { x: PRICE_COL / 2, label: 'Price' },
        { x: PRICE_COL + BAR_MAX_W / 2, label: 'Buy Vol' },
        { x: PRICE_COL + BAR_MAX_W + GAP + BAR_MAX_W / 2, label: 'Sell Vol' },
        { x: PRICE_COL + BAR_MAX_W * 2 + GAP + VOL_COL / 2, label: 'Total' },
        { x: PRICE_COL + BAR_MAX_W * 2 + GAP + VOL_COL + DELTA_COL / 2, label: 'Δ' },
      ].map((h, i) => (
        <text key={i} x={h.x} y={14} fill={DIM} fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          {h.label}
        </text>
      ))}

      {levels.map((l, i) => {
        const y = 22 + i * ROW_H
        const isSpot = Math.abs(l.price - spot) < 0.25
        const isPOC  = Math.abs(l.price - pocPrice) < 0.25
        const total  = l.buy_vol + l.sell_vol
        const buyW   = (l.buy_vol / maxTotal) * BAR_MAX_W
        const sellW  = (l.sell_vol / maxTotal) * BAR_MAX_W
        const rowBg  = isPOC ? 'rgba(245,158,11,0.12)' : isSpot ? 'rgba(99,102,241,0.1)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'

        return (
          <g key={i}>
            <rect x={0} y={y} width={W} height={ROW_H} fill={rowBg} />

            {/* Price label */}
            <text x={PRICE_COL - 4} y={y + 14} fill={isSpot ? '#6366f1' : isPOC ? '#f59e0b' : 'var(--text, #e2e8f0)'}
              fontSize="10" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontWeight={isPOC || isSpot ? '700' : '400'}>
              {fmtPrice(l.price)}
            </text>

            {/* Buy bar (right-fill from price col) */}
            <rect x={PRICE_COL} y={y + 3} width={buyW} height={ROW_H - 6} fill="rgba(16,185,129,0.5)" rx="1" />
            <text x={PRICE_COL + buyW + 3} y={y + 14} fill={BULL} fontSize="9" fontFamily="JetBrains Mono, monospace">
              {fmtVol(l.buy_vol)}
            </text>

            {/* Sell bar */}
            <rect x={PRICE_COL + BAR_MAX_W + GAP} y={y + 3} width={sellW} height={ROW_H - 6} fill="rgba(239,68,68,0.5)" rx="1" />
            <text x={PRICE_COL + BAR_MAX_W + GAP + sellW + 3} y={y + 14} fill={BEAR} fontSize="9" fontFamily="JetBrains Mono, monospace">
              {fmtVol(l.sell_vol)}
            </text>

            {/* Total vol */}
            <text x={PRICE_COL + BAR_MAX_W * 2 + GAP + VOL_COL / 2} y={y + 14} fill={DIM} fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {fmtVol(total)}
            </text>

            {/* Delta */}
            <text x={PRICE_COL + BAR_MAX_W * 2 + GAP + VOL_COL + DELTA_COL / 2} y={y + 14}
              fill={l.delta >= 0 ? BULL : BEAR} fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="600">
              {l.delta >= 0 ? '+' : ''}{fmtVol(l.delta)}
            </text>

            {/* POC / Spot badge */}
            {isPOC && (
              <text x={W - 2} y={y + 14} fill="#f59e0b" fontSize="8" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontWeight="700">POC</text>
            )}
            {isSpot && !isPOC && (
              <text x={W - 2} y={y + 14} fill="#6366f1" fontSize="8" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontWeight="700">SPOT</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function FootprintView() {
  const { ticker: globalTicker } = useStore()
  const [ticker, setTicker] = useState(globalTicker || 'SPY')
  const [tf, setTf]         = useState('1d')
  const [lvls, setLvls]     = useState(30)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  async function load() {
    if (!ticker.trim()) return
    setLoading(true); setError(null)
    try {
      const d = await api.get(
        `/order_flow/footprint/${ticker.trim().toUpperCase()}?timeframe=${tf}&levels=${lvls}`
      )
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-sm" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Footprint Chart</strong> — distributes each bar's
        estimated buy and sell volume across the price levels it traded through.{' '}
        <strong style={{ color: '#f59e0b' }}>POC</strong> = Point of Control (most volume traded).{' '}
        <strong style={{ color: '#6366f1' }}>SPOT</strong> = current price.
        Price levels with dominant buy delta show active demand; dominant sell delta shows supply.
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
        <select value={lvls} onChange={e => setLvls(Number(e.target.value))}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {[20, 30, 40, 60].map(v => <option key={v} value={v}>{v} levels</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 130 }}>
          {loading ? 'Building…' : 'Build Footprint'}
        </button>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Distributing volume across price levels…</span></div>}

      {data && (
        <>
          <div className="card-grid-4" style={{ gap: 10 }}>
            {[
              { label: 'Spot Price', value: `$${Number(data.spot).toFixed(2)}`, color: '#6366f1', sub: 'Current price' },
              { label: 'POC Price',  value: `$${Number(data.poc_price).toFixed(2)}`, color: '#f59e0b', sub: 'Highest volume level' },
              { label: 'Net Delta',  value: (data.total_delta >= 0 ? '+' : '') + data.total_delta.toLocaleString(),
                color: data.total_delta >= 0 ? BULL : BEAR, sub: data.total_delta >= 0 ? 'Net buying' : 'Net selling' },
              { label: 'Price Levels', value: data.levels.length, color: 'var(--text)', sub: `${tf} window` },
            ].map(c => (
              <div key={c.label} className="card card-sm">
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '12px 10px', overflowX: 'auto' }}>
            <FootprintChart levels={data.levels} spot={data.spot} pocPrice={data.poc_price} />
          </div>
        </>
      )}
    </div>
  )
}
