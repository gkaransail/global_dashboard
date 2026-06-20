import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

const CHAMBER_OPTIONS = ['All', 'House', 'Senate']
const TYPE_OPTIONS    = ['All', 'Purchase', 'Sale']
const DAYS_OPTIONS    = [30, 90, 180]

function fmt(v) {
  if (v == null) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toLocaleString()}`
}

function PartyDot({ party }) {
  const color = party === 'Democrat' ? '#3b82f6' : party === 'Republican' ? '#ef4444' : 'var(--muted)'
  if (!party) return null
  return <span title={party} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0, verticalAlign: 'middle' }} />
}

function TypeBadge({ type }) {
  const buy = type === 'Purchase'
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
      background: buy ? 'var(--bull-dim)' : 'var(--bear-dim)',
      color: buy ? 'var(--bull)' : 'var(--bear)',
      border: `1px solid ${buy ? 'rgba(34,211,122,.25)' : 'rgba(240,82,82,.25)'}`,
    }}>
      {buy ? '▲ Buy' : '▼ Sale'}
    </span>
  )
}

function PriceDelta({ current, amountMin, type }) {
  if (!current || !amountMin) return <span style={{ color: 'var(--muted)' }}>—</span>
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
      ${current.toLocaleString()}
    </span>
  )
}

function FilterBtn({ value, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6,
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent-hi)' : color || 'var(--muted)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>
      {value}
    </button>
  )
}

function SkeletonRow() {
  return (
    <tr>{[55, 160, 55, 60, 70, 100, 70, 70].map((w, i) => (
      <td key={i} style={{ padding: '11px 10px' }}>
        <div style={{ height: 13, background: 'var(--surface2)', borderRadius: 4, width: w, animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}</tr>
  )
}

export default function TradeFeed() {
  const setGlobalTicker = useStore(s => s.setTicker)

  const [days, setDays]                   = useState(90)
  const [chamber, setChamber]             = useState('All')
  const [txType, setTxType]               = useState('All')
  const [tickerInput, setTickerInput]     = useState('')
  const [tickerFilter, setTickerFilter]   = useState('')
  const [data, setData]                   = useState(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ days, limit: 300 })
      if (tickerFilter) p.set('ticker', tickerFilter)
      if (chamber !== 'All') p.set('chamber', chamber.toLowerCase())
      if (txType  !== 'All') p.set('transaction_type', txType)
      setData(await api.get(`/congress/feed?${p}`))
    } catch (e) { setError(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [tickerFilter, days, chamber, txType])

  useEffect(() => { load() }, [load])

  const applyTickerFilter = () => setTickerFilter(tickerInput.trim().toUpperCase())
  const clearTickerFilter = () => { setTickerFilter(''); setTickerInput('') }

  const trades  = data?.trades || []
  const total   = data?.total ?? 0
  const hasData = trades.length > 0

  const COLS = ['Date', 'Member', '🏛', 'Ticker', 'Type', 'Size (Range)', 'Current Price', 'Disclosed']

  return (
    <div style={{ padding: 20 }}>
      {/* Info banner */}
      <div style={{ marginBottom: 14, padding: '9px 14px', background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--accent-hi)' }}>STOCK Act disclosures</strong> — Members of Congress must
        report trades within 45 days. Amounts are disclosed as ranges (e.g. $15K–$50K), not exact figures.
        Current price added for context on where the stock trades today.
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Chamber:</span>
          {CHAMBER_OPTIONS.map(c => <FilterBtn key={c} value={c} active={chamber === c} onClick={() => setChamber(c)} />)}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Type:</span>
          {TYPE_OPTIONS.map(t => (
            <FilterBtn key={t} value={t} active={txType === t} onClick={() => setTxType(t)}
              color={t === 'Purchase' ? 'var(--bull)' : t === 'Sale' ? 'var(--bear)' : undefined} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Window:</span>
          {DAYS_OPTIONS.map(d => <FilterBtn key={d} value={`${d}d`} active={days === d} onClick={() => setDays(d)} />)}
        </div>
        {/* Ticker search */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={tickerInput}
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && applyTickerFilter()}
            placeholder="Filter ticker…"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '5px 10px', fontSize: 12, width: 120 }}
          />
          <FilterBtn value="Filter" active={false} onClick={applyTickerFilter} />
          {tickerFilter && <FilterBtn value={`${tickerFilter} ×`} active onClick={clearTickerFilter} />}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' }}>
          {trades.length} of {total} trades
        </span>
        <button onClick={load} disabled={loading} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? '⟳' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 14 }}>⚠️ {error} <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--bear)', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button></div>}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {COLS.map(col => (
                  <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !hasData && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

              {!loading && !error && !hasData && (
                <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>No congressional trades found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your filters or extending the time window.</div>
                </td></tr>
              )}

              {!loading && trades.map((trade, i) => (
                <tr key={i}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Date */}
                  <td style={{ padding: '10px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {trade.transaction_date || '—'}
                  </td>

                  {/* Member */}
                  <td style={{ padding: '10px 12px', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <PartyDot party={trade.party} />
                      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>{trade.member || '—'}</span>
                      {trade.state && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--muted)' }}>({trade.state})</span>}
                    </span>
                  </td>

                  {/* Chamber icon */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {trade.chamber === 'senate' ? <span title="Senate">🏛️</span> : <span title="House">🏠</span>}
                  </td>

                  {/* Ticker */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setGlobalTicker(trade.ticker); setTickerInput(trade.ticker); setTickerFilter(trade.ticker) }} title={trade.asset_description || trade.ticker} style={{
                      background: 'var(--surface2)', border: '1px solid var(--border-hi)', borderRadius: 4,
                      color: 'var(--accent-hi)', fontWeight: 800, fontSize: 12, padding: '2px 8px',
                      cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.3px', transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
                    >
                      {trade.ticker || '—'}
                    </button>
                  </td>

                  {/* Type */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <TypeBadge type={trade.transaction_type} />
                  </td>

                  {/* Size range */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                      {trade.amount || '—'}
                    </span>
                    {trade.amount_min > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                        min {fmt(trade.amount_min)}
                      </div>
                    )}
                  </td>

                  {/* Current price */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {trade.current_price != null ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
                        ${trade.current_price.toLocaleString()}
                      </span>
                    ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>

                  {/* Disclosure date */}
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {trade.disclosure_date || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && hasData && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          Source: House Stock Watcher &amp; Senate Stock Watcher — STOCK Act disclosure aggregators. Data lags by 24–48h.
          Exact price paid is not disclosed — Congress reports dollar ranges only.
        </div>
      )}
    </div>
  )
}
