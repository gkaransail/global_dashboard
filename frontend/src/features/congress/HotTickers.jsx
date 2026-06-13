import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

const DAYS_OPTIONS = [30, 90, 180]

function SentimentBadge({ sentiment }) {
  const config = {
    bullish: { bg: 'var(--bull-dim)', color: 'var(--bull)', border: 'rgba(34,211,122,.25)', label: '🟢 Bullish' },
    bearish: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)', label: '🔴 Bearish' },
    mixed:   { bg: 'rgba(245,158,11,.12)', color: '#f59e0b', border: 'rgba(245,158,11,.25)', label: '🟡 Mixed' },
  }
  const s = config[sentiment] || config.mixed
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

function FlowBar({ purchases, sales }) {
  const total = purchases + sales
  if (total === 0) return null
  const buyPct  = Math.round((purchases / total) * 100)
  const sellPct = 100 - buyPct

  return (
    <div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span>
          <span style={{ color: 'var(--bull)', fontWeight: 700 }}>▲ {purchases}</span> purchases
        </span>
        <span>
          <span style={{ color: 'var(--bear)', fontWeight: 700 }}>▼ {sales}</span> sales
        </span>
      </div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}>
        <div style={{ width: `${buyPct}%`, background: 'var(--bull)', transition: 'width 0.5s ease' }} />
        <div style={{ width: `${sellPct}%`, background: 'var(--bear)', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--muted)' }}>
        <span>{buyPct}% buy</span>
        <span>{sellPct}% sell</span>
      </div>
    </div>
  )
}

function TickerCard({ ticker }) {
  const setTicker = useStore(s => s.setTicker)
  const members = ticker.members || []
  const displayMembers = members.slice(0, 5)
  const extraCount = members.length - displayMembers.length

  return (
    <div
      onClick={() => setTicker(ticker.ticker)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: 'var(--shadow-sm)',
        transition: 'border-color 0.15s, transform 0.1s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{
          fontSize: 20,
          fontWeight: 900,
          color: 'var(--text)',
          letterSpacing: '-0.5px',
        }}>
          {ticker.ticker}
        </div>
        <SentimentBadge sentiment={ticker.sentiment} />
      </div>

      {/* Trade count */}
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
        <strong style={{ color: 'var(--text)', fontWeight: 800 }}>{ticker.total_trades}</strong> congressional trades
        {members.length > 0 && (
          <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
            · {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Flow bars */}
      <FlowBar purchases={ticker.purchase_count} sales={ticker.sale_count} />

      {/* Members list */}
      {displayMembers.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 6 }}>
            Members trading
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {displayMembers.map((m, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border-hi)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-dim)',
                  whiteSpace: 'nowrap',
                }}
                title={m}
              >
                {/* Show short version of name */}
                {m.replace(/^(Rep\.|Sen\.)\s+/, '').split(' ').slice(-1)[0]}
              </span>
            ))}
            {extraCount > 0 && (
              <span style={{
                fontSize: 11,
                padding: '2px 7px',
                background: 'var(--surface2)',
                border: '1px solid var(--border-hi)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--muted)',
              }}>
                +{extraCount} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function HotTickers() {
  const [days, setDays]   = useState(90)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/congress/tickers?days=${days}&limit=30`)
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to load tickers')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const tickers = data?.tickers || []

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
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Days:</span>
          {DAYS_OPTIONS.map(d => (
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

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{tickers.length}</strong> tickers with activity
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', alignItems: 'center' }}>
          <span>🟢 Buys &gt; 1.5× Sells</span>
          <span>🔴 Sells &gt; 1.5× Buys</span>
          <span>🟡 Mixed</span>
        </div>
      </div>

      {/* Click hint */}
      <div style={{
        marginBottom: 16,
        padding: '8px 12px',
        background: 'rgba(99,102,241,.04)',
        border: '1px solid rgba(99,102,241,.12)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        color: 'var(--muted)',
      }}>
        Click any ticker card to set it as the active ticker across all analysis tools.
      </div>

      {/* Grid */}
      {tickers.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔥</div>
          <div>No ticker activity found for this period.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {tickers.map((t, i) => (
            <TickerCard key={`${t.ticker}-${i}`} ticker={t} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
        Sentiment: <strong style={{ color: 'var(--bull)' }}>Bullish</strong> = purchases &gt; 1.5× sales.{' '}
        <strong style={{ color: 'var(--bear)' }}>Bearish</strong> = sales &gt; 1.5× purchases.{' '}
        <strong style={{ color: '#f59e0b' }}>Mixed</strong> = neither dominates.
        Source: STOCK Act public disclosures.
      </div>
    </div>
  )
}
