import { useState, useEffect } from 'react'

const API = 'http://localhost:8000/api/v1/earnings'

const SIGNAL_STYLE = {
  overpriced:    { color: '#f87171', label: '⚠ Options Overpriced' },
  underpriced:   { color: '#34d399', label: '✓ Options Underpriced' },
  fairly_priced: { color: '#94a3b8', label: '≈ Fairly Priced' },
}

export default function EarningsCalendar({ onSelectTicker }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [daysAhead, setDaysAhead] = useState(60)
  const [customTickers, setCustomTickers] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days_ahead: daysAhead })
      if (customTickers.trim()) params.set('tickers', customTickers.trim())
      const res = await fetch(`${API}/calendar?${params}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [daysAhead])

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#e2e8f0' }}>Upcoming Earnings</h2>

        <select
          value={daysAhead}
          onChange={e => setDaysAhead(Number(e.target.value))}
          style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px' }}
        >
          <option value={14}>Next 2 weeks</option>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>

        <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
          <input
            placeholder="Custom tickers: AAPL,TSLA,NVDA"
            value={customTickers}
            onChange={e => setCustomTickers(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            style={{ flex: 1, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem' }}
          />
          <button onClick={load}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>
            Scan
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem' }}>Loading earnings data…</div>
      ) : data.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem' }}>No earnings found in this window.</div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 60px 80px 110px 110px 80px 100px 1fr', gap: '8px', padding: '6px 12px', color: '#64748b', fontSize: '0.75rem', borderBottom: '1px solid #1e293b' }}>
            <span>TICKER</span><span>DATE</span><span>DTE</span><span>PRICE</span>
            <span>EXP MOVE</span><span>AVG HIST MOVE</span><span>BEAT RATE</span>
            <span>OPTIONS SIGNAL</span><span></span>
          </div>

          {data.map(row => {
            const sig = SIGNAL_STYLE[row.pricing_signal] || {}
            const expVsHist = row.expected_move_pct && row.avg_historical_move_pct
              ? (row.expected_move_pct / row.avg_historical_move_pct).toFixed(1)
              : null

            return (
              <div key={row.ticker}
                onClick={() => onSelectTicker && onSelectTicker(row.ticker)}
                style={{ display: 'grid', gridTemplateColumns: '80px 90px 60px 80px 110px 110px 80px 100px 1fr', gap: '8px', padding: '10px 12px', background: '#0f172a', borderRadius: '8px', cursor: 'pointer', border: '1px solid #1e293b', alignItems: 'center', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
              >
                <span style={{ color: '#60a5fa', fontWeight: 600, fontSize: '0.9rem' }}>{row.ticker}</span>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{row.earnings_date}</span>
                <span style={{ color: row.dte <= 7 ? '#f87171' : row.dte <= 14 ? '#fbbf24' : '#94a3b8', fontSize: '0.85rem' }}>{row.dte}d</span>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>${row.spot}</span>
                <span style={{ color: '#a78bfa', fontSize: '0.85rem', fontWeight: 500 }}>
                  {row.expected_move_pct ? `±${row.expected_move_pct}%` : '—'}
                  {row.expected_move_dollar ? <span style={{ color: '#64748b', fontSize: '0.75rem' }}> (${row.expected_move_dollar})</span> : null}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  {row.avg_historical_move_pct ? `±${row.avg_historical_move_pct}%` : '—'}
                  {expVsHist ? <span style={{ color: '#64748b', fontSize: '0.75rem' }}> ({expVsHist}x)</span> : null}
                </span>
                <span style={{ color: row.beat_rate_pct >= 75 ? '#34d399' : '#94a3b8', fontSize: '0.85rem' }}>
                  {row.beat_rate_pct != null ? `${row.beat_rate_pct}%` : '—'}
                </span>
                <span style={{ color: sig.color || '#64748b', fontSize: '0.78rem' }}>{sig.label || '—'}</span>
                <span style={{ color: '#3b82f6', fontSize: '0.78rem' }}>→ Analyze</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '1.5rem', color: '#475569', fontSize: '0.75rem' }}>
        <strong style={{ color: '#64748b' }}>How to read this:</strong> Exp Move = what options are pricing in (ATM IV × √DTE/365).
        Avg Hist Move = how much the stock actually moved on past earnings days.
        The multiplier (e.g. 3.2x) means options are pricing in 3.2× the historical average — potentially overpriced.
      </div>
    </div>
  )
}
