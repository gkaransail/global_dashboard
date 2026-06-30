import { useState } from 'react'
import { api } from '../../core/api'

const fmtPrice = (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`
const fmtVol   = (v) => { if (v == null) return '—'; const a = Math.abs(v); return a >= 1e6 ? `${(a/1e6).toFixed(1)}M` : a >= 1e3 ? `${(a/1e3).toFixed(0)}K` : String(a) }

const BULL   = '#10b981'
const BEAR   = '#ef4444'
const ACCENT = '#6366f1'
const DIM    = '#475569'
const AMBER  = '#f59e0b'


// One row in the footprint: price label + buy bar | sell bar + delta badge
function FootprintRow({ level, maxTotal, spot, pocPrice, vah, val, step }) {
  const total  = level.buy_vol + level.sell_vol
  const buyPct = total ? level.buy_vol / total * 100 : 50

  const isPOC   = Math.abs(level.price - pocPrice) < step * 0.5
  const isSpot  = Math.abs(level.price - spot)     < step * 0.5
  const isVAH   = Math.abs(level.price - vah)      < step * 0.5
  const isVAL   = Math.abs(level.price - val)      < step * 0.5
  const inVA    = level.price >= val && level.price <= vah

  const barMaxW = 220
  const buyW    = (level.buy_vol / maxTotal) * barMaxW
  const sellW   = (level.sell_vol / maxTotal) * barMaxW

  const imbull  = level.imbalance === 'bullish'
  const imbear  = level.imbalance === 'bearish'

  const rowBg = isPOC   ? 'rgba(245,158,11,0.1)'
               : isSpot  ? 'rgba(99,102,241,0.1)'
               : inVA    ? 'rgba(255,255,255,0.02)'
               : 'transparent'

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 24, background: rowBg,
      borderBottom: '1px solid rgba(255,255,255,0.025)', padding: '2px 0', position: 'relative' }}>

      {/* VA bracket */}
      {(isVAH || isVAL) && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: 'rgba(99,102,241,0.6)', borderRadius: isVAH ? '2px 2px 0 0' : '0 0 2px 2px' }} />
      )}

      {/* Price label */}
      <div style={{ width: 70, textAlign: 'right', paddingRight: 10, fontSize: 11,
        fontFamily: 'JetBrains Mono,monospace', flexShrink: 0,
        color: isSpot ? ACCENT : isPOC ? AMBER : inVA ? 'var(--text)' : DIM,
        fontWeight: (isPOC || isSpot) ? 700 : 400 }}>
        {fmtPrice(level.price)}
      </div>

      {/* Buy bar (left-expanding) */}
      <div style={{ width: barMaxW, display: 'flex', justifyContent: 'flex-end', paddingRight: 2, flexShrink: 0 }}>
        <div style={{ height: 14, width: buyW, background: imbull ? 'rgba(16,185,129,0.9)' : 'rgba(16,185,129,0.35)',
          borderRadius: 2, minWidth: total > 0 ? 1 : 0, transition: 'width 0.2s' }} />
      </div>

      {/* Center divider */}
      <div style={{ width: 1, height: 18, background: '#1e293b', flexShrink: 0 }} />

      {/* Sell bar (right-expanding) */}
      <div style={{ width: barMaxW, paddingLeft: 2, flexShrink: 0 }}>
        <div style={{ height: 14, width: sellW, background: imbear ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.35)',
          borderRadius: 2, minWidth: total > 0 ? 1 : 0, transition: 'width 0.2s' }} />
      </div>

      {/* OFI% label */}
      <div style={{ width: 38, textAlign: 'center', fontSize: 10, fontFamily: 'JetBrains Mono,monospace', flexShrink: 0,
        color: imbull ? BULL : imbear ? BEAR : DIM, fontWeight: (imbull || imbear) ? 700 : 400 }}>
        {Math.round(buyPct)}%
      </div>

      {/* Delta */}
      <div style={{ width: 64, textAlign: 'right', paddingRight: 8, fontSize: 10, fontFamily: 'JetBrains Mono,monospace',
        flexShrink: 0, color: level.delta >= 0 ? BULL : BEAR, fontWeight: 600 }}>
        {level.delta >= 0 ? '+' : ''}{fmtVol(level.delta)}
      </div>

      {/* Badges */}
      <div style={{ width: 50, textAlign: 'right', paddingRight: 6, fontSize: 9, flexShrink: 0 }}>
        {isPOC  && <span style={{ color: AMBER,  fontWeight: 700, fontFamily: 'JetBrains Mono,monospace' }}>POC</span>}
        {isSpot && !isPOC && <span style={{ color: ACCENT, fontWeight: 700, fontFamily: 'JetBrains Mono,monospace' }}>SPOT</span>}
        {isVAH  && !isPOC && !isSpot && <span style={{ color: '#94a3b8', fontWeight: 600, fontFamily: 'JetBrains Mono,monospace' }}>VAH</span>}
        {isVAL  && !isPOC && !isSpot && <span style={{ color: '#94a3b8', fontWeight: 600, fontFamily: 'JetBrains Mono,monospace' }}>VAL</span>}
        {imbull && !isPOC && !isSpot && <span style={{ color: BULL }}>●</span>}
        {imbear && !isPOC && !isSpot && <span style={{ color: BEAR }}>●</span>}
      </div>
    </div>
  )
}

function KeyZoneCard({ zone, type }) {
  const isDemand = type === 'demand'
  return (
    <div className="card card-sm" style={{ borderLeft: `3px solid ${isDemand ? BULL : BEAR}`, fontSize: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{isDemand ? '🟢 DEMAND' : '🔴 SUPPLY'}</div>
      <div style={{ fontWeight: 700, color: isDemand ? BULL : BEAR, fontFamily: 'JetBrains Mono,monospace', fontSize: 14 }}>
        {fmtPrice(zone.price)}
      </div>
      <div style={{ color: 'var(--muted)', marginTop: 3 }}>{zone.ofi_pct}% buy · Δ {zone.delta > 0 ? '+' : ''}{fmtVol(zone.delta)}</div>
    </div>
  )
}

export default function FootprintView({ ticker, tf }) {
  const [lvls, setLvls]     = useState(30)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  async function load() {
    if (!ticker?.trim()) return
    setLoading(true); setError(null)
    try {
      setData(await api.get(`/order_flow/footprint/${ticker.trim().toUpperCase()}?timeframe=${tf}&levels=${lvls}`))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const levels = data?.levels ?? []
  const maxTotal = levels.length ? Math.max(...levels.map(l => l.buy_vol + l.sell_vol), 1) : 1
  const step = levels.length >= 2 ? Math.abs(levels[0].price - levels[1].price) : 0.01

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Controls — only levels remains, ticker+tf come from shared bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={lvls} onChange={e => setLvls(Number(e.target.value))}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}>
          {[20, 30, 40, 60].map(v => <option key={v} value={v}>{v} price levels</option>)}
        </select>
        <button className="btn-primary" onClick={load} disabled={loading} style={{ minWidth: 130 }}>
          {loading ? 'Building…' : `Build Footprint — ${ticker || '…'}`}
        </button>
      </div>

      {error  && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Distributing volume across price levels…</span></div>}

      {data && <>

        {/* Target Price — hero card */}
        {data.target && (() => {
          const t = data.target
          const bull = t.direction === 'bullish'
          const confColor = t.confidence === 'high' ? BULL : t.confidence === 'medium' ? AMBER : DIM
          return (
            <div className="card" style={{ borderLeft: `4px solid ${bull ? BULL : BEAR}`, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>

                {/* Left: target price */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em' }}>
                    ORDER FLOW TARGET · {data.ticker} · {data.timeframe.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: bull ? BULL : BEAR, fontFamily: 'JetBrains Mono,monospace' }}>
                      {fmtPrice(t.price)}
                    </span>
                    <span style={{ fontSize: 14, color: bull ? BULL : BEAR, fontWeight: 600 }}>
                      {bull ? '▲' : '▼'} {t.distance_pct > 0 ? '+' : ''}{t.distance_pct}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, maxWidth: 420, lineHeight: 1.6 }}>
                    {t.scenario}
                  </div>
                </div>

                {/* Right: confidence + stop */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180 }}>
                  <div className="card card-sm" style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>CONFIDENCE</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: confColor, textTransform: 'uppercase', fontFamily: 'JetBrains Mono,monospace' }}>
                      {t.confidence}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{t.confidence_note}</div>
                  </div>
                  <div className="card card-sm" style={{ padding: '10px 14px', borderLeft: `2px solid ${bull ? BEAR : BULL}` }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>STOP / INVALIDATION</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: bull ? BEAR : BULL, fontFamily: 'JetBrains Mono,monospace' }}>
                      {fmtPrice(t.stop_zone)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{t.stop_note}</div>
                  </div>
                </div>
              </div>

              {/* Basis tag */}
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Basis: {t.basis}
              </div>
            </div>
          )
        })()}

        {/* Plain English Reading */}
        <div className="card card-sm" style={{ borderLeft: `3px solid ${data.total_delta >= 0 ? BULL : BEAR}`, fontSize: 13, lineHeight: 1.8, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>READING</div>
          {data.reading}
        </div>

        {/* Key stats */}
        <div className="card-grid-4" style={{ gap: 10 }}>
          {[
            { label: 'POC — most volume', value: fmtPrice(data.poc_price), color: AMBER,
              sub: 'Price gravitates back here' },
            { label: 'Value Area', value: `${fmtPrice(data.value_area_low)} – ${fmtPrice(data.value_area_high)}`,
              color: ACCENT, sub: '70% of today\'s volume' },
            { label: 'Net Delta', value: (data.total_delta >= 0 ? '+' : '') + fmtVol(data.total_delta),
              color: data.total_delta >= 0 ? BULL : BEAR,
              sub: data.total_delta >= 0 ? 'Net buying' : 'Net selling' },
            { label: 'Spot vs VWAP', value: fmtPrice(data.spot), color: data.spot >= data.vwap ? BULL : BEAR,
              sub: `${data.spot >= data.vwap ? '▲ above' : '▼ below'} VWAP ${fmtPrice(data.vwap)}` },
          ].map(c => (
            <div key={c.label} className="card card-sm">
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.color, fontFamily: 'JetBrains Mono,monospace' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Key zones */}
        {(data.demand_zones?.length > 0 || data.supply_zones?.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: BULL, fontWeight: 600 }}>DEMAND ZONES (buyers dominated)</div>
              {data.demand_zones.map((z,i) => <KeyZoneCard key={i} zone={z} type="demand" />)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: BEAR, fontWeight: 600 }}>SUPPLY ZONES (sellers dominated)</div>
              {data.supply_zones.map((z,i) => <KeyZoneCard key={i} zone={z} type="supply" />)}
            </div>
          </div>
        )}

        {/* Footprint chart */}
        <div className="card" style={{ padding: '10px 0' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 6px 0', borderBottom: '1px solid var(--border)', marginBottom: 4, fontSize: 10, color: DIM, fontFamily: 'JetBrains Mono,monospace' }}>
            <div style={{ width: 70, textAlign: 'right', paddingRight: 10 }}>PRICE</div>
            <div style={{ width: 220, textAlign: 'right', paddingRight: 8 }}>← BUY VOL</div>
            <div style={{ width: 1 }} />
            <div style={{ width: 220, paddingLeft: 8 }}>SELL VOL →</div>
            <div style={{ width: 38, textAlign: 'center' }}>BUY%</div>
            <div style={{ width: 64, textAlign: 'right', paddingRight: 8 }}>DELTA</div>
            <div style={{ width: 50 }} />
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, padding: '0 12px 8px', fontSize: 10, color: DIM }}>
            <span><span style={{ color: AMBER, fontWeight: 700 }}>POC</span> = most volume</span>
            <span><span style={{ color: ACCENT, fontWeight: 700 }}>SPOT</span> = current price</span>
            <span><span style={{ color: '#94a3b8' }}>VAH/VAL</span> = value area edges (70% vol)</span>
            <span><span style={{ color: BULL }}>●</span> = 3:1 buy imbalance</span>
            <span><span style={{ color: BEAR }}>●</span> = 3:1 sell imbalance</span>
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {levels.map((l, i) => (
              <FootprintRow key={i} level={l} maxTotal={maxTotal} step={step}
                spot={data.spot} pocPrice={data.poc_price}
                vah={data.value_area_high} val={data.value_area_low} />
            ))}
          </div>
        </div>
      </>}
    </div>
  )
}
