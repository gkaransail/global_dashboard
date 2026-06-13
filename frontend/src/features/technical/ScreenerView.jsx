import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const CONDITION_META = {
  rsi_oversold:    { label: 'RSI Oversold',     icon: '📉', color: 'var(--bull)',    bg: 'var(--bull-dim)',    border: 'rgba(34,211,122,.25)' },
  rsi_overbought:  { label: 'RSI Overbought',   icon: '📈', color: 'var(--bear)',    bg: 'var(--bear-dim)',    border: 'rgba(240,82,82,.25)' },
  above_ema200:    { label: 'Above EMA 200',     icon: '⬆️', color: 'var(--bull)',    bg: 'var(--bull-dim)',    border: 'rgba(34,211,122,.25)' },
  below_ema200:    { label: 'Below EMA 200',     icon: '⬇️', color: 'var(--bear)',    bg: 'var(--bear-dim)',    border: 'rgba(240,82,82,.25)' },
  golden_cross:    { label: 'Golden Cross',      icon: '✦',  color: 'var(--gold)',    bg: 'var(--gold-dim)',    border: 'rgba(245,158,11,.25)' },
  death_cross:     { label: 'Death Cross',       icon: '✦',  color: 'var(--bear)',    bg: 'var(--bear-dim)',    border: 'rgba(240,82,82,.25)' },
  bb_squeeze:      { label: 'BB Squeeze',        icon: '⟨⟩', color: 'var(--accent-hi)', bg: 'var(--accent-dim)', border: 'rgba(99,102,241,.25)' },
  high_volume:     { label: 'High Volume',       icon: '🔊', color: 'var(--gold)',    bg: 'var(--gold-dim)',    border: 'rgba(245,158,11,.25)' },
  near_52w_high:   { label: 'Near 52W High',     icon: '🏔️', color: 'var(--bull)',    bg: 'var(--bull-dim)',    border: 'rgba(34,211,122,.25)' },
  near_52w_low:    { label: 'Near 52W Low',      icon: '🕳️', color: 'var(--bear)',    bg: 'var(--bear-dim)',    border: 'rgba(240,82,82,.25)' },
}

function ConditionPill({ condId, active, onClick }) {
  const meta = CONDITION_META[condId] || { label: condId, icon: '•', color: 'var(--muted)', bg: 'var(--surface2)', border: 'var(--border)' }
  return (
    <button
      onClick={() => onClick(condId)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
        fontSize: 12, fontWeight: 700, border: `1px solid ${active ? meta.border : 'var(--border)'}`,
        background: active ? meta.bg : 'var(--surface2)',
        color: active ? meta.color : 'var(--muted)',
        transition: 'all .15s',
        fontFamily: 'inherit',
      }}
    >
      <span>{meta.icon}</span>
      {meta.label}
      {active && <span style={{ marginLeft: 2, opacity: 0.8 }}>✕</span>}
    </button>
  )
}

function ConditionTag({ condId }) {
  const meta = CONDITION_META[condId] || { label: condId, color: 'var(--muted)', bg: 'var(--surface2)', border: 'var(--border)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 7px', borderRadius: 20, fontSize: 9, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.3,
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  )
}

export default function ScreenerView({ onSelectTicker }) {
  const setTicker = useStore(s => s.setTicker)
  const navigate = useNavigate()
  const [activeConditions, setActiveConditions] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async (conditions) => {
    setLoading(true)
    setError(null)
    try {
      const condStr = conditions.join(',')
      const res = await api.get(`/technical/screener?conditions=${condStr}&limit=50`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Load on mount with empty conditions
  useEffect(() => { load([]) }, [])

  const toggleCondition = (condId) => {
    const next = activeConditions.includes(condId)
      ? activeConditions.filter(c => c !== condId)
      : [...activeConditions, condId]
    setActiveConditions(next)
    load(next)
  }

  const handleTickerClick = (ticker) => {
    setTicker(ticker)
    if (onSelectTicker) onSelectTicker(ticker)
    // Navigate to indicators tab for this ticker
    navigate('../indicators')
  }

  const results = data?.results || []

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Condition pills */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--muted)', marginBottom: 10 }}>
          Filter Conditions — click to toggle (AND logic)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.keys(CONDITION_META).map(condId => (
            <ConditionPill
              key={condId}
              condId={condId}
              active={activeConditions.includes(condId)}
              onClick={toggleCondition}
            />
          ))}
        </div>
        {activeConditions.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)' }}>
            Showing tickers matching{' '}
            <strong style={{ color: 'var(--accent-hi)' }}>all {activeConditions.length}</strong>
            {' '}selected condition{activeConditions.length !== 1 ? 's' : ''}.{' '}
            <button
              onClick={() => { setActiveConditions([]); load([]) }}
              style={{ background: 'none', border: 'none', color: 'var(--bear)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Summary row */}
      {data && (
        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>
            <strong style={{ color: 'var(--text)' }}>{data.total_found}</strong> stocks found
          </span>
          <span style={{ color: 'var(--border-hi)' }}>|</span>
          <span>Click a ticker to view its indicators</span>
        </div>
      )}

      {/* Loading / Error */}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>}
      {error && <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>⚠️ {error}</div>}

      {/* Results table */}
      {!loading && results.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {['Ticker', 'Price', 'Change %', 'RSI', 'Conditions', 'Score'].map(h => (
                  <th key={h} style={{
                    padding: '9px 14px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: 0.6,
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr
                  key={row.ticker}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleTickerClick(row.ticker)}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-hi)', letterSpacing: 0.3 }}>
                      {row.ticker}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    ${row.price?.toFixed(2) ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700,
                    color: row.change_pct > 0 ? 'var(--bull)' : row.change_pct < 0 ? 'var(--bear)' : 'var(--muted)' }}>
                    {row.change_pct != null ? `${row.change_pct > 0 ? '+' : ''}${row.change_pct.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700,
                    color: row.rsi < 30 ? 'var(--bull)' : row.rsi > 70 ? 'var(--bear)' : 'var(--text-dim)' }}>
                    {row.rsi != null ? row.rsi.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.conditions.length === 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>None</span>
                      ) : (
                        row.conditions.map(c => <ConditionTag key={c} condId={c} />)
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 800, letterSpacing: -0.5,
                        color: row.score >= 3 ? 'var(--bull)' : row.score >= 2 ? 'var(--gold)' : 'var(--muted)',
                      }}>
                        {row.score}
                      </div>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} style={{
                            width: 5, height: 16, borderRadius: 2,
                            background: i < row.score
                              ? (row.score >= 4 ? 'var(--bull)' : row.score >= 2 ? 'var(--gold)' : 'var(--accent)')
                              : 'var(--border-hi)',
                          }} />
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && results.length === 0 && data && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔎</div>
          <div style={{ fontWeight: 700, color: 'var(--text-dim)', fontSize: 15, marginBottom: 6 }}>
            No stocks match the selected conditions
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Try removing some filters or selecting different conditions.
          </div>
        </div>
      )}
    </div>
  )
}
