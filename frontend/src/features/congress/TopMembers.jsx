import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

const DAYS_OPTIONS = [30, 90, 180]
const SORT_OPTIONS = [
  { key: 'total_trades',   label: 'Total Trades' },
  { key: 'purchase_count', label: 'Purchases' },
  { key: 'sale_count',     label: 'Sales' },
]
const FILTER_OPTIONS = ['All', 'Purchases Only', 'Sales Only']

function partyColor(party) {
  if (party === 'Democrat')   return '#3b82f6'
  if (party === 'Republican') return '#ef4444'
  return 'var(--muted)'
}

function formatValue(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B+`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M+`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K+`
  return `$${v.toLocaleString()}+`
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{
      height: 5,
      background: 'var(--border)',
      borderRadius: 3,
      overflow: 'hidden',
      flex: 1,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: color,
        borderRadius: 3,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

function MemberCard({ member, maxTrades }) {
  const setTicker = useStore(s => s.setTicker)
  const isBull = member.purchase_count >= member.sale_count
  const pColor = partyColor(member.party)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${pColor}`,
      borderRadius: 'var(--radius)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: 'var(--shadow-sm)',
      transition: 'border-color 0.15s, transform 0.1s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderLeftColor = pColor }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.member || 'Unknown'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {member.chamber && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '1px 7px',
                borderRadius: 20,
                background: 'var(--surface2)',
                border: '1px solid var(--border-hi)',
                color: 'var(--text-dim)',
                letterSpacing: '0.3px',
              }}>
                {member.chamber === 'senate' ? '🏛️ Senate' : '🏠 House'}
              </span>
            )}
            {member.party && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 20,
                background: `${pColor}18`,
                border: `1px solid ${pColor}40`,
                color: pColor,
              }}>
                {member.party}
              </span>
            )}
            {member.state && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                {member.state}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: isBull ? 'var(--bull)' : 'var(--bear)', letterSpacing: '-0.5px' }}>
            {member.total_trades}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>trades</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ProgressBar value={member.total_trades} max={maxTrades} color={isBull ? 'var(--bull)' : 'var(--bear)'} />
      </div>

      {/* Purchase / Sale breakdown */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: 'var(--bull)', fontWeight: 700 }}>▲ {member.purchase_count}</span>
          <span style={{ color: 'var(--muted)' }}>purchases</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: 'var(--bear)', fontWeight: 700 }}>▼ {member.sale_count}</span>
          <span style={{ color: 'var(--muted)' }}>sales</span>
        </div>
      </div>

      {/* Top tickers */}
      {member.tickers_traded && member.tickers_traded.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 5 }}>
            Tickers traded
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {member.tickers_traded.slice(0, 8).map(tk => (
              <button
                key={tk}
                onClick={() => setTicker(tk)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border-hi)',
                  color: 'var(--accent-hi)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
              >
                {tk}
              </button>
            ))}
            {member.tickers_traded.length > 8 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }}>
                +{member.tickers_traded.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Total disclosed */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
        fontSize: 12,
      }}>
        <span style={{ color: 'var(--muted)' }}>Total disclosed</span>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
          {formatValue(member.total_value_min)}
        </span>
      </div>
    </div>
  )
}

export default function TopMembers() {
  const [days, setDays]     = useState(90)
  const [sortKey, setSortKey] = useState('total_trades')
  const [filter, setFilter] = useState('All')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/congress/members?days=${days}&limit=50`)
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const rawMembers = data?.members || []

  const filteredMembers = rawMembers.filter(m => {
    if (filter === 'Purchases Only') return m.purchase_count > 0
    if (filter === 'Sales Only')     return m.sale_count > 0
    return true
  })

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return bv - av
  })

  const maxTrades = sortedMembers.length > 0 ? (sortedMembers[0][sortKey] ?? 0) : 1

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: '#ef4444' }}>
        ⚠️ {error}{' '}
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#ef4444', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Days */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Days:</span>
          {[30, 90, 180].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '5px 11px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`,
                background: days === d ? 'var(--accent-dim)' : 'transparent',
                color: days === d ? 'var(--accent-hi)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Filter:</span>
          {FILTER_OPTIONS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 11px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'var(--accent-dim)' : 'transparent',
                color: filter === f ? 'var(--accent-hi)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Sort by:</span>
          {SORT_OPTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              style={{
                padding: '5px 11px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${sortKey === s.key ? 'var(--accent)' : 'var(--border)'}`,
                background: sortKey === s.key ? 'var(--accent-dim)' : 'transparent',
                color: sortKey === s.key ? 'var(--accent-hi)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
        Showing <strong style={{ color: 'var(--text)' }}>{sortedMembers.length}</strong> members
        {data?.total_members > sortedMembers.length && ` (of ${data.total_members} total)`}
      </div>

      {/* Grid */}
      {sortedMembers.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>👤</div>
          <div>No members found for this period.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {sortedMembers.map((m, i) => (
            <MemberCard key={`${m.member}-${i}`} member={m} maxTrades={maxTrades} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
        Source: STOCK Act disclosures via House Stock Watcher &amp; Senate Stock Watcher.
        Party affiliation and state from disclosure records.
      </div>
    </div>
  )
}
