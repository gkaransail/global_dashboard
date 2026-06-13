import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:8000/api/v1/sentiment'
// Mounted by registry at /api/v1/sentiment (no manual prefix on router)

const VERDICT_COLORS = {
  'Extreme Greed': { bg: '#14532d', border: '#16a34a', text: '#4ade80' },
  'Greed':         { bg: '#166534', border: '#22c55e', text: '#86efac' },
  'Neutral':       { bg: '#1c2a3a', border: '#60a5fa', text: '#93c5fd' },
  'Fear':          { bg: '#7c2d12', border: '#f97316', text: '#fdba74' },
  'Extreme Fear':  { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5' },
}

const INDICATOR_META = {
  vix:           { icon: '📊', desc: 'VIX volatility index vs 50-day moving average' },
  momentum:      { icon: '🚀', desc: 'SPY 125-day price momentum' },
  pcr:           { icon: '⚖️', desc: 'Put/Call ratio across SPY options (3 expirations)' },
  safe_haven:    { icon: '🏛️', desc: 'TLT bonds vs SPY stocks — 20-day relative return' },
  junk_bond:     { icon: '🔗', desc: 'HYG junk bonds vs LQD investment-grade — 20-day' },
  breadth:       { icon: '📡', desc: '% of sector ETFs trading above 200-day MA' },
  price_strength:{ icon: '🏔️', desc: '% of sectors within 5% of 52-week high' },
}

function GaugeDial({ value }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H * 0.78
    const r = W * 0.38

    ctx.clearRect(0, 0, W, H)

    // Arc segments: Extreme Fear → Fear → Neutral → Greed → Extreme Greed
    const segments = [
      { from: Math.PI, to: Math.PI * 1.2,  color: '#ef4444' },
      { from: Math.PI * 1.2, to: Math.PI * 1.4, color: '#f97316' },
      { from: Math.PI * 1.4, to: Math.PI * 1.6, color: '#eab308' },
      { from: Math.PI * 1.6, to: Math.PI * 1.8, color: '#22c55e' },
      { from: Math.PI * 1.8, to: Math.PI * 2,   color: '#16a34a' },
    ]

    segments.forEach(({ from, to, color }) => {
      ctx.beginPath()
      ctx.arc(cx, cy, r, from, to)
      ctx.lineWidth = 22
      ctx.strokeStyle = color
      ctx.stroke()
    })

    // Tick labels
    ctx.font = '11px monospace'
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    const ticks = [
      { val: 0, label: '0' },
      { val: 25, label: '25' },
      { val: 50, label: '50' },
      { val: 75, label: '75' },
      { val: 100, label: '100' },
    ]
    ticks.forEach(({ val, label }) => {
      const angle = Math.PI + (val / 100) * Math.PI
      const x = cx + Math.cos(angle) * (r + 18)
      const y = cy + Math.sin(angle) * (r + 18)
      ctx.fillText(label, x, y)
    })

    // Needle
    const angle = Math.PI + (value / 100) * Math.PI
    const needleLen = r - 8
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(
      cx + Math.cos(angle) * needleLen,
      cy + Math.sin(angle) * needleLen
    )
    ctx.lineWidth = 3
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineCap = 'round'
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#e2e8f0'
    ctx.fill()
  }, [value])

  return <canvas ref={canvasRef} width={280} height={160} style={{ display: 'block', margin: '0 auto' }} />
}

function ScoreBar({ score, label }) {
  const pct = ((score + 1) / 2) * 100
  const color = score > 0.3 ? '#22c55e' : score < -0.3 ? '#ef4444' : '#eab308'
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>
        <span>Extreme Fear</span>
        <span style={{ color, fontWeight: 600 }}>{label}</span>
        <span>Extreme Greed</span>
      </div>
      <div style={{ background: '#1e293b', borderRadius: 4, height: 8, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#334155' }} />
        <div style={{
          position: 'absolute', left: pct < 50 ? `${pct}%` : '50%',
          width: `${Math.abs(pct - 50)}%`,
          height: '100%', borderRadius: 4,
          background: color, opacity: 0.85,
        }} />
        <div style={{
          position: 'absolute', left: `calc(${pct}% - 5px)`, top: -2,
          width: 10, height: 12, borderRadius: 2,
          background: color,
        }} />
      </div>
    </div>
  )
}

function IndicatorCard({ id, data }) {
  const meta = INDICATOR_META[id] || {}
  const fg = data.fg_score ?? 50
  const score = data.score ?? 0
  const colors = VERDICT_COLORS[
    fg >= 75 ? 'Extreme Greed' : fg >= 55 ? 'Greed' : fg >= 45 ? 'Neutral' : fg >= 25 ? 'Fear' : 'Extreme Fear'
  ]

  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${colors.border}20`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
            {meta.icon} {data.label}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{meta.desc}</div>
        </div>
        <div style={{
          background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: 6, padding: '3px 10px',
          fontSize: 13, fontWeight: 700, color: colors.text,
          whiteSpace: 'nowrap',
        }}>
          {fg}
        </div>
      </div>

      <ScoreBar score={score} label={`${score > 0 ? '+' : ''}${(score * 100).toFixed(0)}`} />

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' }}>
        {data.detail}
      </div>

      {/* Extra data rows */}
      {id === 'breadth' && data.sectors && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.sectors.map(s => (
            <span key={s.ticker} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: s.above ? '#14532d' : '#7f1d1d',
              color: s.above ? '#4ade80' : '#fca5a5',
            }}>{s.ticker}</span>
          ))}
        </div>
      )}
      {id === 'price_strength' && data.sectors && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.sectors.map(s => (
            <span key={s.ticker} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: s.near_high ? '#14532d' : '#1e293b',
              color: s.near_high ? '#4ade80' : '#64748b',
            }} title={`${s.pct_from_high}% from high`}>{s.ticker}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SentimentDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true)
      else setLoading(true)
      const url = refresh ? `${API}/dashboard?refresh=true` : `${API}/dashboard`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
      <div>Calculating market sentiment…</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>Fetching VIX, SPY, bonds, sector breadth</div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️ {error}</div>
      <button onClick={() => load()} style={{ marginTop: 8, padding: '8px 20px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  )

  if (!data) return null

  const colors = VERDICT_COLORS[data.verdict] || VERDICT_COLORS['Neutral']
  const change = data.change ?? 0

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>🧠 Market Sentiment</h1>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Fear & Greed Index — updated {new Date(data.last_updated).toLocaleTimeString()}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            padding: '8px 16px', borderRadius: 8, cursor: refreshing ? 'not-allowed' : 'pointer',
            background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0',
            fontSize: 13, opacity: refreshing ? 0.6 : 1,
          }}
        >
          {refreshing ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Main gauge card */}
      <div style={{
        background: '#0f172a', border: `1px solid ${colors.border}`,
        borderRadius: 16, padding: '28px 24px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 40,
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <GaugeDial value={data.fg_index} />
          <div style={{ fontSize: 56, fontWeight: 900, color: colors.text, marginTop: 4, lineHeight: 1 }}>
            {data.fg_index}
          </div>
          <div style={{ fontSize: 18, color: colors.text, fontWeight: 700, marginTop: 4 }}>
            {data.verdict}
          </div>
          {change !== 0 && (
            <div style={{ fontSize: 13, color: change > 0 ? '#4ade80' : '#fca5a5', marginTop: 6 }}>
              {change > 0 ? '▲' : '▼'} {Math.abs(change)} from previous
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Indicator Breakdown
          </div>
          {Object.entries(data.indicators).map(([key, ind]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 130, fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>{ind.label}</div>
              <div style={{ flex: 1, background: '#1e293b', borderRadius: 4, height: 6, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${ind.fg_score}%`,
                  background: ind.fg_score >= 55 ? '#22c55e' : ind.fg_score >= 45 ? '#eab308' : '#ef4444',
                  borderRadius: 4,
                }} />
              </div>
              <div style={{ width: 30, fontSize: 12, color: '#e2e8f0', textAlign: 'right', fontWeight: 600 }}>
                {ind.fg_score}
              </div>
              <div style={{ width: 8, fontSize: 10, color: '#64748b' }}>
                {Math.round(ind.weight * 100)}%
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#1e293b', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
            Composite = weighted average of 7 indicators. Range 0–100.
          </div>
        </div>
      </div>

      {/* Sentiment scale legend */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 12,
      }}>
        {Object.entries(VERDICT_COLORS).map(([label, c]) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}30` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.text }}>{label}</div>
            <div style={{ fontSize: 10, color: c.border, marginTop: 2 }}>
              {label === 'Extreme Fear' ? '0–25' : label === 'Fear' ? '25–45' : label === 'Neutral' ? '45–55' : label === 'Greed' ? '55–75' : '75–100'}
            </div>
          </div>
        ))}
      </div>

      {/* Individual indicator cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {Object.entries(data.indicators).map(([key, ind]) => (
          <IndicatorCard key={key} id={key} data={ind} />
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: '#475569', textAlign: 'center' }}>
        Data via yfinance · Cached 15 min · Not financial advice
      </div>
    </div>
  )
}
