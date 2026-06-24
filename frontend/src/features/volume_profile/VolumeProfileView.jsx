import { useState } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const fmtPrice  = (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`
const fmtVol    = (v) => {
  if (v == null) return '—'
  if (v >= 1e9)  return `${(v/1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${(v/1e6).toFixed(1)}M`
  if (v >= 1e3)  return `${(v/1e3).toFixed(0)}K`
  return String(v)
}

const TIMEFRAMES = [
  { key: '1d',  label: 'Intraday (1m bars)' },
  { key: '5d',  label: '5 Days (5m bars)' },
  { key: '1mo', label: '1 Month (1h bars)' },
  { key: '3mo', label: '3 Months (daily)' },
  { key: '6mo', label: '6 Months (daily)' },
  { key: '1y',  label: '1 Year (daily)' },
]

// ─── SVG Volume Profile chart ──────────────────────────────────────────────

function ProfileChart({ data }) {
  const { profile, spot, vwap, poc, vah, val, price_min: pMin, price_max: pMax } = data

  const SVG_W = 760, SVG_H = 540
  const ML = 72, MR = 82, MT = 15, MB = 15
  const barW  = SVG_W - ML - MR           // 606
  const barH  = SVG_H - MT - MB           // 510
  const n     = profile.length            // 50
  const bktH  = barH / n

  const pRange = pMax - pMin || 1
  const priceY = (p) => MT + (pMax - p) / pRange * barH

  const pocY  = priceY(poc)
  const vahY  = priceY(vah)
  const valY  = priceY(val)
  const spotY = priceY(spot)
  const vwapY = priceY(vwap)

  // Show price labels every 5th bucket
  const labelStep = 5

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', display: 'block' }}>

      {/* Value area background */}
      <rect
        x={ML} y={vahY} width={barW} height={valY - vahY}
        fill="rgba(59,130,246,0.06)" rx="1"
      />

      {/* Per-bucket bars */}
      {profile.map((bkt, i) => {
        const y   = MT + i * bktH
        const tw  = bkt.bar_pct / 100 * barW
        const bw  = tw * bkt.buy_pct / 100
        const sw  = tw - bw
        const h   = Math.max(bktH - 1, 1)

        const bullColor = bkt.is_poc ? '#34d399' : bkt.in_va ? '#10b981' : '#059669'
        const bearColor = bkt.is_poc ? '#f87171' : bkt.in_va ? '#ef4444' : '#dc2626'
        const opacity   = bkt.total_vol === 0 ? 0 : bkt.in_va || bkt.is_poc ? 1 : 0.55

        return (
          <g key={i} opacity={opacity}>
            {bw > 0 && <rect x={ML} y={y} width={bw} height={h} fill={bullColor} />}
            {sw > 0 && <rect x={ML + bw} y={y} width={sw} height={h} fill={bearColor} />}
          </g>
        )
      })}

      {/* VAH / VAL dashed lines */}
      <line x1={ML} y1={vahY} x2={ML + barW} y2={vahY}
        stroke="#60a5fa" strokeWidth="1" strokeDasharray="5,3" />
      <line x1={ML} y1={valY} x2={ML + barW} y2={valY}
        stroke="#60a5fa" strokeWidth="1" strokeDasharray="5,3" />

      {/* POC solid line */}
      <line x1={ML} y1={pocY} x2={ML + barW} y2={pocY}
        stroke="#3b82f6" strokeWidth="1.5" />

      {/* Spot price */}
      <line x1={ML} y1={spotY} x2={ML + barW} y2={spotY}
        stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="6,3" />

      {/* VWAP */}
      <line x1={ML} y1={vwapY} x2={ML + barW} y2={vwapY}
        stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="3,2" />

      {/* Right-side labels */}
      {[
        { y: pocY,  label: `POC ${fmtPrice(poc)}`,  color: '#3b82f6'  },
        { y: vahY,  label: `VAH ${fmtPrice(vah)}`,  color: '#60a5fa'  },
        { y: valY,  label: `VAL ${fmtPrice(val)}`,  color: '#60a5fa'  },
        { y: spotY, label: `SPOT ${fmtPrice(spot)}`, color: '#f1f5f9' },
        { y: vwapY, label: `VWAP ${fmtPrice(vwap)}`, color: '#06b6d4' },
      ].map(({ y, label, color }) => (
        <text key={label} x={ML + barW + 6} y={y + 4}
          fill={color} fontSize="10" fontFamily="JetBrains Mono, monospace">{label}</text>
      ))}

      {/* Left-side price axis labels */}
      {profile
        .filter((_, i) => i % labelStep === 0)
        .map((bkt, j) => {
          const i = j * labelStep
          const y = MT + (i + 0.5) * bktH
          return (
            <text key={i} x={ML - 4} y={y + 4}
              fill="#64748b" fontSize="10" textAnchor="end"
              fontFamily="JetBrains Mono, monospace">
              {Number(bkt.price).toFixed(2)}
            </text>
          )
        })
      }

      {/* Legend */}
      <g transform={`translate(${ML}, ${SVG_H - 2})`}>
        <rect x="0" y="-8" width="10" height="8" fill="#10b981" />
        <text x="13" y="-1" fill="#64748b" fontSize="10">Buy vol</text>
        <rect x="65" y="-8" width="10" height="8" fill="#ef4444" />
        <text x="78" y="-1" fill="#64748b" fontSize="10">Sell vol</text>
        <rect x="130" y="-8" width="10" height="8" fill="rgba(59,130,246,0.25)" />
        <text x="143" y="-1" fill="#64748b" fontSize="10">Value Area (70%)</text>
      </g>
    </svg>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────

export default function VolumeProfileView() {
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
      const d = await api.get(`/volume_profile/profile/${ticker.trim().toUpperCase()}?timeframe=${tf}`)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const buyPct  = data ? Math.round(data.buy_ratio * 100)  : null
  const sellPct = data ? 100 - buyPct : null

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Guide */}
      <div className="card card-sm" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>📊 Volume Profile</strong> — shows <em>where</em> the most
        buying and selling happened at each price level.{' '}
        <span style={{ color: 'var(--bull)' }}>Green</span> = estimated buy volume,{' '}
        <span style={{ color: 'var(--bear)' }}>Red</span> = sell volume.{' '}
        The widest bar is the <strong style={{ color: 'var(--accent-hi)' }}>Point of Control (POC)</strong> —
        the price where the most trading occurred. The shaded blue band is the{' '}
        <strong>Value Area</strong> (70% of all volume). Prices tend to revert to the POC and
        respect the Value Area edges as support/resistance.
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
          {loading ? 'Loading…' : 'Load Profile'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
            {data.ticker} · {data.timeframe} · updated {new Date(data.last_updated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Building profile…</span></div>}

      {/* Summary cards */}
      {data && (
        <div className="card-grid-4" style={{ gap: 10 }}>
          {[
            { label: 'Point of Control', value: fmtPrice(data.poc), color: 'var(--accent-hi)', sub: 'Highest volume price' },
            { label: 'Value Area High',  value: fmtPrice(data.vah), color: 'var(--accent)',    sub: 'Top of 70% value area' },
            { label: 'Value Area Low',   value: fmtPrice(data.val), color: 'var(--accent)',    sub: 'Bottom of 70% value area' },
            { label: 'VWAP',             value: fmtPrice(data.vwap), color: '#06b6d4',         sub: `Spot ${fmtPrice(data.spot)}` },
            { label: 'Total Volume',     value: fmtVol(data.total_volume), color: 'var(--text)', sub: `${fmtVol(data.buy_volume)} buy / ${fmtVol(data.sell_volume)} sell` },
            {
              label: 'Buy Pressure',
              value: `${buyPct}%`,
              color: buyPct >= 52 ? 'var(--bull-hi)' : buyPct <= 48 ? 'var(--bear-hi)' : 'var(--text)',
              sub: buyPct >= 52 ? '▲ Buyers dominate' : buyPct <= 48 ? '▼ Sellers dominate' : 'Balanced',
            },
          ].map(c => (
            <div key={c.label} className="card card-sm">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono, monospace' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}

          {/* Buy/sell bar */}
          <div className="card card-sm" style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Buy / Sell Volume Split</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
              <div style={{ width: `${buyPct}%`, background: 'var(--bull)', transition: 'width .4s' }} />
              <div style={{ flex: 1, background: 'var(--bear)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ color: 'var(--bull)' }}>{buyPct}% buy</span>
              <span style={{ color: 'var(--bear)' }}>{sellPct}% sell</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {data && (
        <div className="card" style={{ padding: '14px 10px 8px' }}>
          <ProfileChart data={data} />
        </div>
      )}

      {/* How to trade this */}
      {data && (
        <div className="card card-sm" style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>How to use this:</strong>
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {[
              ['POC as magnet', 'Price tends to return to the POC. If price is far away it may snap back.'],
              ['VAH as resistance', 'Price rallying into VAH from below often stalls or reverses.'],
              ['VAL as support', 'Price pulling back to VAL from above often finds buyers.'],
              ['Low volume nodes', 'Thin bars = price moved fast here = price travels quickly through them.'],
              ['High volume nodes', 'Wide bars = price stalled here = strong support/resistance level.'],
              ['Buy% > 55%', 'More buyers than sellers across the whole session — bullish lean.'],
            ].map(([title, desc]) => (
              <div key={title}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{title}: </span>{desc}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
