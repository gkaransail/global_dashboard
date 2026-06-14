import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../core/store'

const API = '/api/v1/institutional'

const ACTION_COLOR = {
  new:      'var(--bull)',
  adding:   '#4ade80',
  holding:  'var(--muted)',
  trimming: '#f87171',
  closed:   'var(--bear)',
}

const ACTION_LABEL = {
  new:      '🆕 New',
  adding:   '📈 Adding',
  holding:  '➡ Hold',
  trimming: '📉 Trimming',
  closed:   '❌ Closed',
}

function fmt(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toLocaleString()}`
}

function SkeletonRow() {
  return (
    <tr>
      {[120, 160, 80, 60, 60, 70, 80, 90].map((w, i) => (
        <td key={i} style={{ padding: '11px 12px' }}>
          <div style={{ height: 13, background: 'var(--surface2)', borderRadius: 4, width: w, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  )
}

const COLS = ['Filing Date', 'Institution', 'Shares', '% Held', 'Chg %', 'Action', 'Current Price', 'Current Value']

export default function HoldersView() {
  const globalTicker = useStore(s => s.ticker)
  const [input, setInput]   = useState('')
  const [ticker, setTicker] = useState(null)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = useCallback(async (sym) => {
    if (!sym) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await fetch(`${API}/holders/${sym}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load from global store ticker on mount / ticker change
  useEffect(() => {
    if (globalTicker && !ticker) {
      setTicker(globalTicker)
      setInput(globalTicker)
      load(globalTicker)
    }
  }, [globalTicker, ticker, load])

  const search = () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    setTicker(t)
    load(t)
  }

  const holders = data?.holders || []
  const hasData = holders.length > 0

  return (
    <div style={{ padding: 20 }}>
      {/* Info banner */}
      <div style={{ marginBottom: 14, padding: '9px 14px', background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--accent-hi)' }}>SEC 13F filings</strong> — Institutions managing &gt;$100M must disclose equity holdings quarterly.
        Filing date is the last report date (lag of up to 45 days). Current price is live; value at report date is not available.
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ticker (e.g. AAPL)"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 12px', fontSize: 13, width: 180 }}
        />
        <button onClick={search} disabled={loading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : 'Load'}
        </button>
        {ticker && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Showing 13F holders for <strong style={{ color: 'var(--accent-hi)' }}>{ticker}</strong>
            {data?.current_price && <span style={{ marginLeft: 8, color: 'var(--text)', fontFamily: 'monospace', fontWeight: 700 }}>${data.current_price.toLocaleString()}</span>}
          </span>
        )}
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 14 }}>⚠️ {error} <button onClick={() => load(ticker)} style={{ background: 'none', border: 'none', color: 'var(--bear)', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button></div>
      )}

      {/* Summary cards */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Institutional %', value: `${data.ownership.institutional_pct}%` },
            { label: 'Insider %',       value: `${data.ownership.insider_pct}%` },
            { label: 'Total Holders',   value: data.summary.total_holders },
            {
              label: 'Net Flow', value: data.flow.net_flow,
              color: data.flow.net_flow === 'accumulating' ? 'var(--bull)' : data.flow.net_flow === 'distributing' ? 'var(--bear)' : 'var(--muted)',
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>{label}</div>
              <div style={{ color: color || 'var(--text)', fontWeight: 700, fontSize: '1.05rem', textTransform: 'capitalize' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {COLS.map(col => (
                  <th key={col} style={{ padding: '10px 12px', textAlign: col === 'Institution' ? 'left' : 'right', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

              {!loading && !error && !hasData && !data && (
                <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🏛</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>Enter a ticker to load 13F holders</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Data sourced from SEC 13F filings via yfinance.</div>
                </td></tr>
              )}

              {!loading && data && !hasData && (
                <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>No institutional holders found for {ticker}</div>
                </td></tr>
              )}

              {!loading && holders.map((h, i) => (
                <tr key={i}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Filing Date */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {h.date_reported || '—'}
                  </td>

                  {/* Institution */}
                  <td style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text)', fontWeight: 600, fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.name || '—'}
                  </td>

                  {/* Shares */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {h.shares?.toLocaleString() || '—'}
                  </td>

                  {/* % Held */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {h.pct_outstanding != null ? `${h.pct_outstanding}%` : '—'}
                  </td>

                  {/* Chg % */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: h.pct_change > 0 ? 'var(--bull)' : h.pct_change < 0 ? 'var(--bear)' : 'var(--muted)' }}>
                      {h.pct_change > 0 ? '+' : ''}{h.pct_change}%
                    </span>
                  </td>

                  {/* Action */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ACTION_COLOR[h.action] || 'var(--muted)' }}>
                      {ACTION_LABEL[h.action] || h.action}
                    </span>
                  </td>

                  {/* Current Price */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {h.current_price != null
                      ? <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>${h.current_price.toLocaleString()}</span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>

                  {/* Current Value */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {h.current_value != null
                      ? <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmt(h.current_value)}</span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && hasData && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          Source: SEC 13F filings via yfinance. Holdings are reported quarterly with up to 45-day lag.
          Current price is live; price paid at time of purchase is not disclosed in 13F filings.
        </div>
      )}
    </div>
  )
}
