import { useState, useEffect } from 'react'

const API = 'http://localhost:8000/api/v1/earnings'

const SIGNAL_COLOR = {
  overpriced:    '#f87171',
  underpriced:   '#34d399',
  fairly_priced: '#94a3b8',
}
const SIGNAL_LABEL = {
  overpriced:    'Options are overpriced vs history — consider selling premium or buying the stock directly instead of calls',
  underpriced:   'Options are underpriced vs history — buying a straddle/strangle may offer good value',
  fairly_priced: 'Options are fairly priced relative to historical earnings moves',
}

export default function EarningsAnalysis({ initialTicker = '' }) {
  const [ticker, setTicker] = useState(initialTicker || 'AAPL')
  const [input, setInput] = useState(initialTicker || 'AAPL')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async (t) => {
    const sym = (t || ticker).toUpperCase()
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/analysis/${sym}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
      setTicker(sym)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(initialTicker || 'AAPL') }, [initialTicker])

  const d = data

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', maxWidth: '400px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && load(input)}
          placeholder="Ticker (e.g. AAPL)"
          style={{ flex: 1, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '8px 12px', fontSize: '0.9rem' }}
        />
        <button onClick={() => load(input)}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
          Analyze
        </button>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem' }}>Analyzing {ticker}…</div>}

      {!loading && d && (
        <>
          {/* Top summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
            <Card label="Next Earnings" value={d.next_earnings_date || 'Unknown'} sub={d.dte != null ? `${d.dte} days away` : ''} />
            <Card label="Current Price" value={d.spot ? `$${d.spot}` : '—'} />
            <Card label="Expected Move" value={d.expected_move ? `±${d.expected_move.pct}%` : '—'}
              sub={d.expected_move ? `±$${d.expected_move.dollar} | ATM IV ${d.expected_move.atm_iv}%` : ''}
              valueColor="#a78bfa" />
            <Card label="Avg Historical Move" value={d.summary.avg_historical_move_pct ? `±${d.summary.avg_historical_move_pct}%` : '—'}
              sub={d.summary.max_historical_move_pct ? `Max: ±${d.summary.max_historical_move_pct}%` : ''} />
            <Card label="EPS Beat Rate" value={d.summary.beat_rate_pct != null ? `${d.summary.beat_rate_pct}%` : '—'}
              sub={`Last ${d.summary.quarters_sampled} quarters`}
              valueColor={d.summary.beat_rate_pct >= 75 ? '#34d399' : '#e2e8f0'} />
          </div>

          {/* Pricing signal */}
          {d.pricing_signal && (
            <div style={{ background: '#0f172a', border: `1px solid ${SIGNAL_COLOR[d.pricing_signal]}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '1.5rem' }}>
              <span style={{ color: SIGNAL_COLOR[d.pricing_signal], fontWeight: 600, marginRight: '8px' }}>
                {d.pricing_signal === 'overpriced' ? '⚠' : d.pricing_signal === 'underpriced' ? '✓' : '≈'} Options: {d.pricing_signal.replace('_', ' ')}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{SIGNAL_LABEL[d.pricing_signal]}</span>
            </div>
          )}

          {/* History table */}
          <h3 style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            Earnings History (last {d.history.length} quarters)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                  {['Date','EPS Est','EPS Actual','Surprise %','Beat?','Stock Move'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.history.map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#0f172a'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{h.date}</td>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{h.eps_estimate != null ? `$${h.eps_estimate}` : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{h.eps_actual != null ? `$${h.eps_actual}` : '—'}</td>
                    <td style={{ padding: '10px 12px', color: h.surprise_pct > 0 ? '#34d399' : h.surprise_pct < 0 ? '#f87171' : '#94a3b8', fontWeight: 500 }}>
                      {h.surprise_pct != null ? `${h.surprise_pct > 0 ? '+' : ''}${h.surprise_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {h.beat === true ? <span style={{ color: '#34d399' }}>✓ Beat</span>
                       : h.beat === false ? <span style={{ color: '#f87171' }}>✗ Miss</span>
                       : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: h.price_move_pct > 0 ? '#34d399' : h.price_move_pct < 0 ? '#f87171' : '#94a3b8', fontWeight: 500 }}>
                      {h.price_move_pct != null ? `${h.price_move_pct > 0 ? '+' : ''}${h.price_move_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', color: '#475569', fontSize: '0.75rem' }}>
            Stock move = closing price change on the earnings day vs prior day close.
            Expected move = ATM straddle price (what the options market is pricing in as a ±move by next expiry).
          </div>
        </>
      )}
    </div>
  )
}

function Card({ label, value, sub, valueColor = '#e2e8f0' }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 16px' }}>
      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: valueColor, fontSize: '1.2rem', fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}
