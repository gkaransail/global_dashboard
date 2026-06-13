import { useState, useEffect } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

function metricColor(val, goodThresh, okThresh) {
  if (val == null) return 'var(--muted)'
  if (val >= goodThresh) return 'var(--bull)'
  if (val >= okThresh)   return 'var(--gold)'
  return 'var(--bear)'
}

function MetricRow({ label, value, unit = '%', hint, goodThresh, okThresh }) {
  const color = goodThresh != null ? metricColor(value, goodThresh, okThresh) : 'var(--text)'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 12,
      alignItems: 'center',
      padding: '11px 16px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color, textAlign: 'right' }}>
        {value != null ? `${value > 0 ? '+' : ''}${value.toFixed(1)}${unit}` : '—'}
      </div>
    </div>
  )
}

// Inline SVG revenue bar chart
function RevenueBarChart({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ color: 'var(--muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
      No revenue history available
    </div>
  )

  const maxVal = Math.max(...data.map(d => d.revenue))
  const barH = 80
  const barW = 40
  const gap = 16
  const totalW = data.length * (barW + gap)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={barH + 40} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const x = i * (barW + gap)
          const h = maxVal > 0 ? Math.max(4, (d.revenue / maxVal) * barH) : 4
          const y = barH - h
          const label = d.revenue >= 1e9
            ? `$${(d.revenue / 1e9).toFixed(1)}B`
            : d.revenue >= 1e6
              ? `$${(d.revenue / 1e6).toFixed(0)}M`
              : `$${d.revenue}`

          return (
            <g key={d.year}>
              <rect
                x={x} y={y} width={barW} height={h}
                rx={3}
                fill={i === data.length - 1 ? 'var(--accent)' : 'var(--surface3)'}
              />
              <text
                x={x + barW / 2}
                y={barH + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted)"
              >{d.year}</text>
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-dim)"
              >{label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Semicircle growth score gauge (SVG-based, simpler than canvas)
function GrowthGauge({ score }) {
  const cx = 80, cy = 80, r = 60
  // Map score 0–100 to angle Math.PI to 2*Math.PI
  const startAngle = Math.PI
  const endAngle = 2 * Math.PI
  const scoreAngle = startAngle + (score / 100) * Math.PI

  const arcX = (angle) => cx + Math.cos(angle) * r
  const arcY = (angle) => cy + Math.sin(angle) * r

  // Background arc
  const bgPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 0 1 ${arcX(endAngle)} ${arcY(endAngle)}`

  // Score arc
  const largeArc = scoreAngle - startAngle > Math.PI ? 1 : 0
  const scorePath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(scoreAngle)} ${arcY(scoreAngle)}`

  const scoreColor = score >= 65 ? '#22d37a' : score >= 40 ? '#f59e0b' : '#f05252'

  return (
    <svg width={160} height={95} viewBox={`0 0 160 95`} style={{ display: 'block', margin: '0 auto' }}>
      {/* Background track */}
      <path d={bgPath} fill="none" stroke="var(--border)" strokeWidth={14} strokeLinecap="round" />
      {/* Score arc */}
      <path d={scorePath} fill="none" stroke={scoreColor} strokeWidth={14} strokeLinecap="round" />
      {/* Score text */}
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={26} fontWeight={900} fill={scoreColor}>{score}</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize={11} fill="var(--muted)">/ 100</text>
    </svg>
  )
}

export default function GrowthView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    api.get(`/fundamental/growth/${ticker}`)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [ticker])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading growth data…</div>
  if (error)   return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--bear)' }}>
      ⚠️ {error}
      <br />
      <button
        onClick={load}
        style={{ marginTop: 12, padding: '8px 20px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Retry
      </button>
    </div>
  )
  if (!data) return null

  const score = data.growth_score ?? 50
  const scoreVerdict = score >= 65 ? 'Strong Growth' : score >= 45 ? 'Moderate Growth' : 'Weak Growth'
  const scoreColor = score >= 65 ? 'var(--bull)' : score >= 45 ? 'var(--gold)' : 'var(--bear)'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header row: score gauge + revenue chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, marginBottom: 24, alignItems: 'start', flexWrap: 'wrap' }}>

        {/* Growth score gauge */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
          textAlign: 'center',
          minWidth: 180,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
            Growth Score
          </div>
          <GrowthGauge score={score} />
          <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor, marginTop: 4 }}>{scoreVerdict}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{ticker}</div>
        </div>

        {/* Revenue bar chart */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 16 }}>
            Annual Revenue (last 4 years)
          </div>
          <RevenueBarChart data={data.revenue_history} />
          {data.revenue_growth_yoy != null && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
              YoY: <span style={{ fontWeight: 700, color: metricColor(data.revenue_growth_yoy, 10, 0) }}>
                {data.revenue_growth_yoy > 0 ? '+' : ''}{data.revenue_growth_yoy.toFixed(1)}%
              </span>
              {data.revenue_growth_3y_cagr != null && (
                <span>
                  {' '}· 3Y CAGR: <span style={{ fontWeight: 700, color: metricColor(data.revenue_growth_3y_cagr, 10, 0) }}>
                    {data.revenue_growth_3y_cagr > 0 ? '+' : ''}{data.revenue_growth_3y_cagr.toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metrics table */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Growth & Margin Metrics
      </div>
      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        <MetricRow
          label="Revenue Growth YoY"
          value={data.revenue_growth_yoy}
          hint="Year-over-year revenue change"
          goodThresh={15} okThresh={5}
        />
        <MetricRow
          label="Revenue 3-Year CAGR"
          value={data.revenue_growth_3y_cagr}
          hint="Compound annual growth rate (3 years)"
          goodThresh={10} okThresh={3}
        />
        <MetricRow
          label="Earnings Growth YoY"
          value={data.earnings_growth_yoy}
          hint="Net income change year-over-year"
          goodThresh={15} okThresh={5}
        />
        <MetricRow
          label="Gross Margin"
          value={data.gross_margin}
          hint="(Revenue - Cost of Goods) / Revenue"
          goodThresh={40} okThresh={20}
        />
        <MetricRow
          label="Operating Margin"
          value={data.operating_margin}
          hint="Operating income / Revenue"
          goodThresh={15} okThresh={5}
        />
        <MetricRow
          label="Net Profit Margin"
          value={data.net_margin}
          hint="Net income / Revenue"
          goodThresh={10} okThresh={3}
        />
        <div style={{ borderBottom: 'none' }}>
          <MetricRow
            label="FCF Yield"
            value={data.fcf_yield}
            hint="Free cash flow / Market cap — higher is more attractive"
            goodThresh={4} okThresh={1}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        Data via yfinance · Cached 1 hr · Not financial advice
      </div>
    </div>
  )
}
