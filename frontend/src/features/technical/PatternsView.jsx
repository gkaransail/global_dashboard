import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const PATTERN_META = {
  double_top:               { icon: '🔽', bullish: false, label: 'Double Top' },
  double_bottom:            { icon: '🔼', bullish: true,  label: 'Double Bottom' },
  head_and_shoulders:       { icon: '🔽', bullish: false, label: 'Head & Shoulders' },
  inverse_head_and_shoulders: { icon: '🔼', bullish: true, label: 'Inv. Head & Shoulders' },
  ascending_triangle:       { icon: '🔼', bullish: true,  label: 'Ascending Triangle' },
  descending_triangle:      { icon: '🔽', bullish: false, label: 'Descending Triangle' },
  symmetrical_triangle:     { icon: '◆',  bullish: null,  label: 'Symmetrical Triangle' },
  bull_flag:                { icon: '🔼', bullish: true,  label: 'Bull Flag' },
  bear_flag:                { icon: '🔽', bullish: false, label: 'Bear Flag' },
  breakout:                 { icon: '🚀', bullish: true,  label: 'Breakout' },
  breakdown:                { icon: '💥', bullish: false, label: 'Breakdown' },
}

function ConfidenceBadge({ confidence }) {
  const pct = Math.round(confidence * 100)
  const color = pct >= 75 ? 'var(--bull)' : pct >= 50 ? 'var(--gold)' : 'var(--muted)'
  const bg = pct >= 75 ? 'var(--bull-dim)' : pct >= 50 ? 'var(--gold-dim)' : 'rgba(80,88,120,.1)'
  const border = pct >= 75 ? 'rgba(34,211,122,.25)' : pct >= 50 ? 'rgba(245,158,11,.25)' : 'rgba(80,88,120,.2)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {pct}% confidence
    </span>
  )
}

function PatternCard({ pattern }) {
  const meta = PATTERN_META[pattern.type] || { icon: '📊', bullish: null, label: pattern.type }
  const borderColor = meta.bullish === true ? 'var(--bull)' : meta.bullish === false ? 'var(--bear)' : 'var(--accent)'

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 10,
      padding: '16px 18px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 22 }}>{meta.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {pattern.detected_at}
            </div>
          </div>
        </div>
        <ConfidenceBadge confidence={pattern.confidence} />
      </div>

      {/* Description */}
      <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        {pattern.description}
      </div>

      {/* Target / Invalidation table */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8, marginTop: 2,
      }}>
        <div style={{
          padding: '8px 12px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 }}>
            Price Target
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: meta.bullish ? 'var(--bull)' : meta.bullish === false ? 'var(--bear)' : 'var(--accent-hi)', letterSpacing: -0.3 }}>
            ${pattern.target?.toFixed(2) ?? '—'}
          </div>
        </div>
        <div style={{
          padding: '8px 12px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 }}>
            Invalidation
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bear)', letterSpacing: -0.3 }}>
            ${pattern.invalidation?.toFixed(2) ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PatternsView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/technical/patterns/${ticker}`)
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

  const { patterns, price, pattern_count } = data
  const bullish = patterns.filter(p => PATTERN_META[p.type]?.bullish === true)
  const bearish = patterns.filter(p => PATTERN_META[p.type]?.bullish === false)
  const neutral = patterns.filter(p => PATTERN_META[p.type]?.bullish === null)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Summary header */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
          {ticker} — ${price?.toFixed(2)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {pattern_count} pattern{pattern_count !== 1 ? 's' : ''} detected
        </span>
        {bullish.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bull)', background: 'var(--bull-dim)', border: '1px solid rgba(34,211,122,.25)', padding: '2px 10px', borderRadius: 20 }}>
            {bullish.length} Bullish
          </span>
        )}
        {bearish.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bear)', background: 'var(--bear-dim)', border: '1px solid rgba(240,82,82,.25)', padding: '2px 10px', borderRadius: 20 }}>
            {bearish.length} Bearish
          </span>
        )}
        {neutral.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'rgba(80,88,120,.1)', border: '1px solid rgba(80,88,120,.2)', padding: '2px 10px', borderRadius: 20 }}>
            {neutral.length} Neutral
          </span>
        )}
      </div>

      {/* Pattern cards */}
      {patterns.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: '48px 24px',
          textAlign: 'center', color: 'var(--muted)', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, color: 'var(--text-dim)', fontSize: 16, marginBottom: 6 }}>
            No patterns detected for {ticker}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 340, margin: '0 auto' }}>
            Pattern detection requires sufficient price history with clear local extrema.
            Try a different ticker or check back after more price action.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {patterns.map((pattern, i) => (
            <PatternCard key={`${pattern.type}-${i}`} pattern={pattern} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px',
        fontSize: 11, color: 'var(--muted)',
      }}>
        <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pattern Guide</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(PATTERN_META).map(([key, meta]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {meta.icon} <span style={{ color: 'var(--text-dim)' }}>{meta.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
