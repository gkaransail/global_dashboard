import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

const SORT_OPTIONS = [
  { key: 'date',   label: 'Date' },
  { key: 'value',  label: 'Value' },
  { key: 'shares', label: 'Shares' },
]

function formatValue(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toLocaleString()}`
}

function formatShares(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString()
}

function SummaryBar({ transactions, days }) {
  const buys = transactions.filter(t => t.transaction_type === 'Buy')
  const sells = transactions.filter(t => t.transaction_type === 'Sell')
  const netShares = buys.reduce((s, t) => s + t.shares, 0) - sells.reduce((s, t) => s + t.shares, 0)
  const netValue  = buys.reduce((s, t) => s + t.value,  0) - sells.reduce((s, t) => s + t.value,  0)
  const isBull = netShares >= 0

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      marginBottom: '20px',
      padding: '14px 16px',
      background: 'var(--surface2)',
      border: `1px solid ${isBull ? 'rgba(34,211,122,.2)' : 'rgba(240,82,82,.2)'}`,
      borderLeft: `3px solid ${isBull ? 'var(--bull)' : 'var(--bear)'}`,
      borderRadius: 'var(--radius)',
    }}>
      <SumCard
        label="Net Shares"
        value={`${netShares >= 0 ? '+' : ''}${formatShares(netShares)}`}
        color={isBull ? 'var(--bull)' : 'var(--bear)'}
      />
      <SumCard
        label="Net Value"
        value={`${netValue >= 0 ? '+' : '-'}${formatValue(Math.abs(netValue))}`}
        color={isBull ? 'var(--bull)' : 'var(--bear)'}
      />
      <SumCard label="Purchases" value={buys.length} color="var(--bull)" />
      <SumCard label="Sales"     value={sells.length} color="var(--bear)" />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Last {days} days</span>
      </div>
    </div>
  )
}

function SumCard({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: '16px', fontWeight: 800, color, letterSpacing: '-0.3px' }}>{value}</span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} style={{ padding: '12px 10px' }}>
          <div style={{
            height: '14px',
            background: 'var(--surface2)',
            borderRadius: '4px',
            width: i === 1 ? '120px' : i === 2 ? '90px' : '60px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function TransactionFeed() {
  const ticker    = useStore(s => s.ticker)
  const [days]    = useState(180)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [filter, setFilter] = useState('All')   // All | Buy | Sell
  const [sortKey, setSortKey] = useState('date')
  const [sortAsc, setSortAsc] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/insider/feed/${ticker}?days=${days}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [ticker, days])

  useEffect(() => { load() }, [load])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(a => !a)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sortedTransactions = () => {
    if (!data) return []
    let txs = data.transactions || []
    if (filter !== 'All') txs = txs.filter(t => t.transaction_type === filter)

    return [...txs].sort((a, b) => {
      let av, bv
      if (sortKey === 'date')   { av = a.date;   bv = b.date }
      if (sortKey === 'value')  { av = a.value;  bv = b.value }
      if (sortKey === 'shares') { av = a.shares; bv = b.shares }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
  }

  const transactions = sortedTransactions()
  const hasData = data && data.transactions && data.transactions.length > 0

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{ color: 'var(--muted)', marginLeft: '4px', opacity: 0.4 }}>↕</span>
    return <span style={{ color: 'var(--accent-hi)', marginLeft: '4px' }}>{sortAsc ? '↑' : '↓'}</span>
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Context note */}
      <div style={{
        marginBottom: '16px',
        padding: '10px 14px',
        background: 'rgba(99,102,241,.06)',
        border: '1px solid rgba(99,102,241,.15)',
        borderRadius: 'var(--radius)',
        fontSize: '12px',
        color: 'var(--text-dim)',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--accent-hi)' }}>Signal note:</strong> Open market purchases (Form 4, transaction code P) are
        considered bullish signals — insiders are buying with their own money at market price.
        Sales are common for diversification and should be weighed alongside other signals.
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['All', 'Buy', 'Sell'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'var(--accent-dim)' : 'transparent',
                color: filter === f ? 'var(--accent-hi)' : 'var(--muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {f === 'Buy' ? '🟢 Buy' : f === 'Sell' ? '🔴 Sell' : 'All'}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: 'auto' }}>
          Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} for <strong style={{ color: 'var(--accent-hi)' }}>{ticker}</strong>
        </span>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '6px 14px',
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

      {/* Error */}
      {error && (
        <div className="error-box" style={{ marginBottom: '16px' }}>
          <span>Failed to load transactions for {ticker}.</span>{' '}
          <button
            onClick={load}
            style={{ background: 'none', border: 'none', color: 'var(--bear)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary bar */}
      {!loading && hasData && (
        <SummaryBar transactions={data.transactions} days={days} />
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{
                background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
              }}>
                {[
                  { key: 'date',  label: 'Date' },
                  { key: null,    label: 'Insider' },
                  { key: null,    label: 'Title' },
                  { key: null,    label: 'Type' },
                  { key: 'shares', label: 'Shares' },
                  { key: null,    label: 'Price' },
                  { key: 'value', label: 'Value' },
                  { key: null,    label: 'Ownership' },
                ].map(col => (
                  <th
                    key={col.label}
                    onClick={col.key ? () => handleSort(col.key) : undefined}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.7px',
                      color: sortKey === col.key ? 'var(--accent-hi)' : 'var(--muted)',
                      cursor: col.key ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {col.label}
                    {col.key && <SortIcon k={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !hasData && Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}

              {!loading && !error && !hasData && (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-dim)' }}>
                      No insider transactions found for {ticker} in the last 6 months
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      This ticker may not have recent Form 4 filings, or yfinance data may not be available.
                    </div>
                  </td>
                </tr>
              )}

              {!loading && transactions.map((tx, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {tx.date || '—'}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {tx.insider_name || '—'}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-dim)', fontSize: '12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.title || '—'}
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 10px',
                      borderRadius: '20px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      background: tx.transaction_type === 'Buy' ? 'var(--bull-dim)' : 'var(--bear-dim)',
                      color: tx.transaction_type === 'Buy' ? 'var(--bull)' : 'var(--bear)',
                      border: `1px solid ${tx.transaction_type === 'Buy' ? 'rgba(34,211,122,.25)' : 'rgba(240,82,82,.25)'}`,
                    }}>
                      {tx.transaction_type === 'Buy' ? '▲ Buy' : '▼ Sell'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--text)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatShares(tx.shares)}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {tx.price ? `$${tx.price.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--text)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatValue(tx.value)}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {tx.ownership_type || 'Direct'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      {!loading && hasData && (
        <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
          Source: SEC Form 4 filings via yfinance. Data reflects open market transactions only (Purchase/Sale).
          Awards, grants, and option exercises are excluded.
        </div>
      )}
    </div>
  )
}
