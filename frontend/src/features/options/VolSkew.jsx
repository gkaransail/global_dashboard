import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

// ── Inline SVG chart — no charting lib needed ─────────────────────────────

function LineChart({ series, width = 520, height = 200, yLabel = 'IV %' }) {
  // series: [{label, color, points: [{x, y}]}]
  if (!series?.length || !series[0]?.points?.length) return null

  const pad = { top: 20, right: 20, bottom: 36, left: 44 }
  const W = width - pad.left - pad.right
  const H = height - pad.top - pad.bottom

  const allX = series.flatMap(s => s.points.map(p => p.x))
  const allY = series.flatMap(s => s.points.map(p => p.y).filter(Boolean))
  if (!allY.length) return null

  const minX = Math.min(...allX), maxX = Math.max(...allX)
  const minY = Math.min(...allY) * 0.92
  const maxY = Math.max(...allY) * 1.08

  const cx = x => maxX === minX ? W / 2 : ((x - minX) / (maxX - minX)) * W
  const cy = y => H - ((y - minY) / (maxY - minY)) * H

  // Y axis ticks
  const yTicks = 4
  const yStep = (maxY - minY) / yTicks
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + i * yStep)

  // X axis ticks (just first/mid/last for strikes, or labels for term structure)
  const xTicks = series[0].points.length <= 8
    ? series[0].points.map(p => p.x)
    : [allX[0], allX[Math.floor(allX.length / 2)], allX[allX.length - 1]]

  const uniqueXTicks = [...new Set(xTicks)]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <g transform={`translate(${pad.left},${pad.top})`}>
        {/* Grid lines */}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={cy(v)} x2={W} y2={cy(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={-6} y={cy(v) + 4} textAnchor="end" fill="var(--muted)" fontSize={10}>{v.toFixed(1)}%</text>
          </g>
        ))}

        {/* X axis labels */}
        {uniqueXTicks.map((v, i) => (
          <text key={i} x={cx(v)} y={H + 18} textAnchor="middle" fill="var(--muted)" fontSize={10}>
            {typeof v === 'number' && v > 100 ? `$${v}` : v}
          </text>
        ))}

        {/* Axis labels */}
        <text x={W / 2} y={H + 32} textAnchor="middle" fill="var(--muted)" fontSize={10}>{series[0].xLabel || 'Strike'}</text>
        <text x={-H / 2} y={-32} textAnchor="middle" fill="var(--muted)" fontSize={10} transform="rotate(-90)">{yLabel}</text>

        {/* Series lines */}
        {series.map((s, si) => {
          const pts = s.points.filter(p => p.y != null)
          if (pts.length < 2) return null
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(p.x).toFixed(1)},${cy(p.y).toFixed(1)}`).join(' ')
          return (
            <g key={si}>
              <path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={cx(p.x)} cy={cy(p.y)} r={3} fill={s.color} />
              ))}
            </g>
          )
        })}

        {/* Spot price vertical line (for skew chart) */}
        {series[0].spotX != null && (
          <line x1={cx(series[0].spotX)} y1={0} x2={cx(series[0].spotX)} y2={H}
            stroke="var(--accent)" strokeWidth={1} strokeDasharray="4,3" />
        )}
      </g>

      {/* Legend */}
      <g transform={`translate(${pad.left + 8}, ${pad.top - 12})`}>
        {series.map((s, i) => (
          <g key={i} transform={`translate(${i * 100}, 0)`}>
            <line x1={0} y1={0} x2={20} y2={0} stroke={s.color} strokeWidth={2} />
            <text x={24} y={4} fill="var(--muted)" fontSize={10}>{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function VolSkew() {
  const { ticker } = useStore()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [selectedExp, setSelected] = useState(null)

  useEffect(() => { load() }, [ticker])

  async function load() {
    setLoading(true); setError(null); setData(null)
    try {
      const d = await api.get(`/options/skew/${ticker}?max_expirations=8`)
      setData(d)
      if (d.term_structure?.length > 1) setSelected(d.term_structure[1].expiration)
      else if (d.term_structure?.length) setSelected(d.term_structure[0].expiration)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const skewData = selectedExp ? data?.skew_by_exp?.[selectedExp] : null
  const termData = data?.term_structure ?? []

  // Build smile chart series
  const smilePoints = skewData?.points ?? []
  const callSmile = smilePoints.map(p => ({ x: p.moneyness, y: p.call_iv }))
  const putSmile  = smilePoints.map(p => ({ x: p.moneyness, y: p.put_iv }))

  // Build term structure series
  const termPoints = termData.filter(t => t.atm_iv_pct != null).map(t => ({ x: t.dte, y: t.atm_iv_pct, label: t.label }))

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {error && <div className="error-box">⚠ {error}</div>}
      {loading && <div className="spinner-wrap"><div className="spinner" /><span>Calculating IV skew...</span></div>}

      {data && (
        <>
          {/* ── Term Structure ──────────────────────────────────────── */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 3 }}>ATM IV Term Structure</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>How implied volatility changes across expiration dates</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Spot: <strong style={{ color: 'var(--text)' }}>${data.spot_price?.toFixed(2)}</strong></div>
            </div>

            {/* Term structure table */}
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Expiration','DTE','ATM IV','25Δ Skew','Skew Signal'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {termData.map(t => {
                    const skewSignal = t.skew_25d == null ? '—'
                      : t.skew_25d > 5 ? '⬆ Put premium elevated (bearish hedging)'
                      : t.skew_25d < -5 ? '⬇ Call premium elevated (bullish positioning)'
                      : '→ Balanced skew'
                    const skewColor = t.skew_25d > 5 ? 'var(--bear)' : t.skew_25d < -5 ? 'var(--bull)' : 'var(--muted)'
                    const isSelected = t.expiration === selectedExp
                    return (
                      <tr key={t.expiration}
                        onClick={() => setSelected(t.expiration)}
                        style={{ cursor: 'pointer', background: isSelected ? 'var(--accent-dim)' : '' }}
                        onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'var(--surface2)')}
                        onMouseLeave={e => !isSelected && (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: isSelected ? 700 : 400 }}>
                          {isSelected && '▸ '}{t.label}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{t.dte}d</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--accent)' }}>
                          {t.atm_iv_pct != null ? `${t.atm_iv_pct}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: skewColor, fontWeight: 600 }}>
                          {t.skew_25d != null ? `${t.skew_25d > 0 ? '+' : ''}${t.skew_25d}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: skewColor, fontSize: 11 }}>{skewSignal}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Term structure chart */}
            {termPoints.length >= 2 && (
              <LineChart
                yLabel="ATM IV %"
                series={[{
                  label: 'ATM IV',
                  color: 'var(--accent)',
                  xLabel: 'Days to Expiry (DTE)',
                  points: termPoints.map(p => ({ x: p.x, y: p.y })),
                }]}
              />
            )}
          </div>

          {/* ── Volatility Smile ──────────────────────────────────── */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 3 }}>
                  Volatility Smile — {skewData?.label ?? ''}
                  {skewData?.dte != null && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> ({skewData.dte}d)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  IV by moneyness (% from spot). Dashed line = spot. Click a row above to change expiration.
                </div>
              </div>
              {skewData?.skew_25d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>25Δ Skew</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: skewData.skew_25d > 0 ? 'var(--bear)' : 'var(--bull)' }}>
                    {skewData.skew_25d > 0 ? '+' : ''}{skewData.skew_25d}%
                  </div>
                </div>
              )}
            </div>

            {smilePoints.length > 2 ? (
              <LineChart
                yLabel="Implied Volatility %"
                series={[
                  { label: 'Call IV', color: 'var(--bull)', points: callSmile.filter(p => p.y), spotX: 0 },
                  { label: 'Put IV',  color: 'var(--bear)', points: putSmile.filter(p => p.y),  spotX: 0 },
                ]}
              />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No smile data for this expiration. Select a different expiration above.
              </div>
            )}
          </div>

          {/* Interpretation guide */}
          <div className="card card-sm" style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>How to Read This</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              <div><strong style={{ color: 'var(--text)' }}>Put skew positive (+)</strong> → traders paying premium for downside protection; bearish hedging demand</div>
              <div><strong style={{ color: 'var(--text)' }}>IV term structure upward</strong> → market expects more volatility further out (normal)</div>
              <div><strong style={{ color: 'var(--text)' }}>Flat/inverted term structure</strong> → near-term event risk (earnings, Fed, etc.)</div>
              <div><strong style={{ color: 'var(--text)' }}>Smile steepening</strong> → increasing fear of a large move in either direction</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
