import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

// ── Price Ladder SVG ─────────────────────────────────────────────────────────

function PriceLadder({ support, resistance, currentPrice }) {
  if (!support || !resistance || !currentPrice) return null

  // Collect all levels + current price for range
  const allPrices = [
    currentPrice,
    ...support.map(l => l.price),
    ...resistance.map(l => l.price),
  ].filter(Boolean)

  if (allPrices.length < 2) return null

  const minP = Math.min(...allPrices) * 0.995
  const maxP = Math.max(...allPrices) * 1.005
  const range = maxP - minP || 1

  const W = 480
  const H = 360
  const leftPad = 80
  const rightPad = 120
  const topPad = 20
  const bottomPad = 20
  const innerH = H - topPad - bottomPad

  const priceToY = (p) => topPad + innerH - ((p - minP) / range) * innerH

  const strengthDots = (strength) => {
    const count = strength === 'strong' ? 3 : strength === 'moderate' ? 2 : 1
    return count
  }

  const currentY = priceToY(currentPrice)

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
      {/* Y-axis line */}
      <line x1={leftPad} y1={topPad} x2={leftPad} y2={H - bottomPad} stroke="var(--border-hi)" strokeWidth={1} />

      {/* Resistance levels */}
      {resistance.map((lvl, i) => {
        const y = priceToY(lvl.price)
        const dots = strengthDots(lvl.strength)
        return (
          <g key={`r-${i}`}>
            <line x1={leftPad - 6} y1={y} x2={W - rightPad} y2={y}
              stroke="rgba(240,82,82,0.45)" strokeWidth={1.5} strokeDasharray="5 3" />
            {/* Price label left */}
            <text x={leftPad - 10} y={y + 4} fontSize={10} fill="#f05252" textAnchor="end" fontWeight="700">
              ${lvl.price.toFixed(2)}
            </text>
            {/* Level label right */}
            <text x={W - rightPad + 8} y={y + 4} fontSize={10} fill="rgba(240,82,82,0.8)" textAnchor="start">
              {lvl.label}
            </text>
            {/* Strength dots */}
            {Array.from({ length: dots }).map((_, di) => (
              <circle key={di} cx={W - rightPad + 76 + di * 8} cy={y} r={3} fill="#f05252" opacity={0.7} />
            ))}
          </g>
        )
      })}

      {/* Support levels */}
      {support.map((lvl, i) => {
        const y = priceToY(lvl.price)
        const dots = strengthDots(lvl.strength)
        return (
          <g key={`s-${i}`}>
            <line x1={leftPad - 6} y1={y} x2={W - rightPad} y2={y}
              stroke="rgba(34,211,122,0.45)" strokeWidth={1.5} strokeDasharray="5 3" />
            <text x={leftPad - 10} y={y + 4} fontSize={10} fill="#22d37a" textAnchor="end" fontWeight="700">
              ${lvl.price.toFixed(2)}
            </text>
            <text x={W - rightPad + 8} y={y + 4} fontSize={10} fill="rgba(34,211,122,0.8)" textAnchor="start">
              {lvl.label}
            </text>
            {Array.from({ length: dots }).map((_, di) => (
              <circle key={di} cx={W - rightPad + 76 + di * 8} cy={y} r={3} fill="#22d37a" opacity={0.7} />
            ))}
          </g>
        )
      })}

      {/* Current price line */}
      <line x1={leftPad - 6} y1={currentY} x2={W - rightPad} y2={currentY}
        stroke="var(--accent)" strokeWidth={2.5} />
      <text x={leftPad - 10} y={currentY + 4} fontSize={11} fill="var(--accent-hi)" textAnchor="end" fontWeight="800">
        ${currentPrice.toFixed(2)}
      </text>
      <text x={W - rightPad + 8} y={currentY + 4} fontSize={10} fill="var(--accent-hi)" textAnchor="start" fontWeight="700">
        Current
      </text>
      {/* Current price dot */}
      <circle cx={leftPad - 6} cy={currentY} r={5} fill="var(--accent)" />

      {/* Legend */}
      <g transform={`translate(${leftPad}, ${H - 10})`}>
        <line x1={0} y1={0} x2={16} y2={0} stroke="rgba(240,82,82,0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={20} y={4} fontSize={9} fill="var(--muted)">Resistance</text>
        <line x1={80} y1={0} x2={96} y2={0} stroke="rgba(34,211,122,0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={100} y={4} fontSize={9} fill="var(--muted)">Support</text>
        <line x1={155} y1={0} x2={171} y2={0} stroke="var(--accent)" strokeWidth={2} />
        <text x={175} y={4} fontSize={9} fill="var(--muted)">Current</text>
        <circle cx={236} cy={0} r={2.5} fill="var(--muted)" />
        <circle cx={244} cy={0} r={2.5} fill="var(--muted)" />
        <circle cx={252} cy={0} r={2.5} fill="var(--muted)" />
        <text x={258} y={4} fontSize={9} fill="var(--muted)">= Strength</text>
      </g>
    </svg>
  )
}

function StrengthIndicator({ strength }) {
  const count = strength === 'strong' ? 3 : strength === 'moderate' ? 2 : 1
  const color = strength === 'strong' ? 'var(--bull)' : strength === 'moderate' ? 'var(--gold)' : 'var(--muted)'
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i < count ? color : 'var(--border-hi)',
        }} />
      ))}
      <span style={{ fontSize: 10, color, marginLeft: 4, fontWeight: 600, textTransform: 'capitalize' }}>
        {strength}
      </span>
    </span>
  )
}

function LevelRow({ level, side }) {
  const color = side === 'resistance' ? 'var(--bear)' : 'var(--bull)'
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14, color, letterSpacing: -0.3 }}>
        ${level.price.toFixed(2)}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-dim)' }}>
        {level.label}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <StrengthIndicator strength={level.strength} />
      </td>
    </tr>
  )
}

export default function LevelsView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/technical/levels/${ticker}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ticker])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>⚠️ {error}</div>
  if (!data) return null

  const { support, resistance, current_price } = data

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>{ticker}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-hi)', letterSpacing: -0.3 }}>
          ${current_price?.toFixed(2)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--bear)', fontWeight: 700, background: 'var(--bear-dim)', border: '1px solid rgba(240,82,82,.25)', padding: '2px 10px', borderRadius: 20 }}>
          {resistance.length} Resistance Levels
        </span>
        <span style={{ fontSize: 11, color: 'var(--bull)', fontWeight: 700, background: 'var(--bull-dim)', border: '1px solid rgba(34,211,122,.25)', padding: '2px 10px', borderRadius: 20 }}>
          {support.length} Support Levels
        </span>
      </div>

      {/* Price Ladder visualization */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10, padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)', overflowX: 'auto',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--muted)', marginBottom: 12 }}>
          Price Ladder
        </div>
        <PriceLadder support={support} resistance={resistance} currentPrice={current_price} />
      </div>

      {/* Tables side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Resistance */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--bear)', borderRadius: 10,
          overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--bear)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Resistance Levels
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Price</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Strength</th>
              </tr>
            </thead>
            <tbody>
              {resistance.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>None found</td></tr>
              ) : (
                resistance.map((lvl, i) => <LevelRow key={i} level={lvl} side="resistance" />)
              )}
            </tbody>
          </table>
        </div>

        {/* Support */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--bull)', borderRadius: 10,
          overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--bull)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Support Levels
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Price</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Strength</th>
              </tr>
            </thead>
            <tbody>
              {support.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>None found</td></tr>
              ) : (
                support.map((lvl, i) => <LevelRow key={i} level={lvl} side="support" />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
