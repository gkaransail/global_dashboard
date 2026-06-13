import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

const CHAMBER_OPTIONS = ['All', 'House', 'Senate']
const TYPE_OPTIONS = ['All', 'Purchase', 'Sale']
const DAYS_OPTIONS = [30, 90, 180]

function PartyDot({ party }) {
  let color = 'var(--muted)'
  if (party === 'Democrat') color = '#3b82f6'
  if (party === 'Republican') color = '#ef4444'
  if (!party) return null
  return (
    <span
      title={party}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        marginRight: 5,
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  )
}

function TypeBadge({ type }) {
  const isPurchase = type === 'Purchase'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '20px',
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      background: isPurchase ? 'var(--bull-dim)' : 'var(--bear-dim)',
      color: isPurchase ? 'var(--bull)' : 'var(--bear)',
      border: `1px solid ${isPurchase ? 'rgba(34,211,122,.25)' : 'rgba(240,82,82,.25)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isPurchase ? '▲ Purchase' : '▼ Sale'}
    </span>
  )
}

function ChamberIcon({ chamber }) {
  if (chamber === 'senate') return <span title="Senate" style={{ fontSize: 13 }}>🏛️</span>
  if (chamber === 'house')  return <span title="House" style={{ fontSize: 13 }}>🏠</span>
  return null
}

function SkeletonRow() {
  const widths = [70, 140, 60, 80, 80, 120, 90]
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: '12px 10px' }}>
          <div style={{
            height: 13,
            background: 'var(--surface2)',
            borderRadius: 4,
            width: w,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

function FilterBtn({ value, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 13px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent-hi)' : color || 'var(--muted)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </button>
  )
}

export default function TradeFeed() {
  const ticker    = useStore(s => s.ticker)
  const setTicker = useStore(s => s.setTicker)

  const [days, setDays]     = useState(90)
  const [chamber, setChamber] = useState('All')
  const [txType, setTxType] = useState('All')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('days', days)
      params.set('limit', 200)
      if (ticker) params.set('ticker', ticker)
      if (chamber !== 'All') params.set('chamber', chamber.toLowerCase())
      if (txType !== 'All') params.set('transaction_type', txType)
      const res = await api.get(`/congress/feed?${params.toString()}`)
      setData(res)
    } catch (e) {
      setError(e.message || 'Failed to load trades')
    } finally {
      setLoading(false)
    }
  }, [ticker, days, chamber, txType])

  useEffect(() => { load() }, [load])

  const trades = data?.trades || []
  const total  = data?.total ?? 0
  const hasData = trades.length > 0

  return (
    <div style={{ padding: 20 }}>
      {/* Context note */}
      <div style={{
        marginBottom: 16,
        padding: '10px 14px',
        background: 'rgba(99,102,241,.06)',
        border: '1px solid rgba(99,102,241,.15)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        color: 'var(--text-dim)',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--accent-hi)' }}>STOCK Act disclosures:</strong> Members of Congress must
        report stock transactions within 45 days. Data sourced from House and Senate public disclosure portals
        via the Stock Watcher aggregators.
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Chamber */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Chamber:</span>
          {CHAMBER_OPTIONS.map(c => (
            <FilterBtn key={c} value={c} active={chamber === c} onClick={() => setChamber(c)} />
          ))}
        </div>

        {/* Type */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Type:</span>
          {TYPE_OPTIONS.map(t => (
            <FilterBtn
              key={t}
              value={t}
              active={txType === t}
              onClick={() => setTxType(t)}
              color={t === 'Purchase' ? 'var(--bull)' : t === 'Sale' ? 'var(--bear)' : undefined}
            />
          ))}
        </div>

        {/* Days */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Days:</span>
          {DAYS_OPTIONS.map(d => (
            <FilterBtn key={d} value={`${d}d`} active={days === d} onClick={() => setDays(d)} />
          ))}
        </div>

        <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: 'auto' }}>
          Showing <strong style={{ color: 'var(--text)' }}>{trades.length}</strong> of{' '}
          <strong style={{ color: 'var(--text)' }}>{total}</strong> trades
        </span>

        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-dim)',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '⟳' : '↻ Refresh'}
        </button>
      </div>

      {/* Active ticker filter note */}
      {ticker && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          padding: '5px 12px',
          background: 'var(--accent-dim)',
          border: '1px solid rgba(99,102,241,.25)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          color: 'var(--accent-hi)',
        }}>
          Filtered to <strong>{ticker}</strong>
          <button
            onClick={() => setTicker('AAPL')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
            title="Clear ticker filter"
          >
            ×
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          <span>⚠️ {error}</span>{' '}
          <button
            onClick={load}
            style={{ background: 'none', border: 'none', color: 'var(--bear)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Member', 'Chamber', 'Ticker', 'Type', 'Amount Range', 'Disclosed'].map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.7px',
                      color: 'var(--muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !hasData && Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}

              {!loading && !error && !hasData && (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-dim)' }}>
                      No congressional trades found
                    </div>
                    <div style={{ fontSize: 12 }}>
                      Try adjusting your filters or extending the time window.
                    </div>
                  </td>
                </tr>
              )}

              {!loading && trades.map((trade, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Date */}
                  <td style={{ padding: '11px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {trade.transaction_date || '—'}
                  </td>

                  {/* Member */}
                  <td style={{ padding: '11px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <PartyDot party={trade.party} />
                      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>
                        {trade.member || '—'}
                      </span>
                      {trade.state && (
                        <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--muted)' }}>
                          ({trade.state})
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Chamber */}
                  <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChamberIcon chamber={trade.chamber} />
                      <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
                        {trade.chamber || '—'}
                      </span>
                    </div>
                  </td>

                  {/* Ticker */}
                  <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setTicker(trade.ticker)}
                      style={{
                        background: 'var(--surface2)',
                        border: '1px solid var(--border-hi)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--accent-hi)',
                        fontWeight: 800,
                        fontSize: 12,
                        padding: '2px 8px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        letterSpacing: '0.3px',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
                      title={trade.asset_description || trade.ticker}
                    >
                      {trade.ticker || '—'}
                    </button>
                  </td>

                  {/* Type */}
                  <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                    <TypeBadge type={trade.transaction_type} />
                  </td>

                  {/* Amount range */}
                  <td style={{ padding: '11px 12px', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {trade.amount || '—'}
                  </td>

                  {/* Disclosure date */}
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {trade.disclosure_date || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      {!loading && hasData && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
          Source: House Stock Watcher &amp; Senate Stock Watcher — public STOCK Act disclosure aggregators.
          Data typically lags disclosures by 24–48 hours.
        </div>
      )}
    </div>
  )
}
