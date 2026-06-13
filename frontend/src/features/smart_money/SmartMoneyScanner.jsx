import { useState, useEffect } from 'react'

const API = 'http://localhost:8000/api/v1/smart_money'

const VERDICT_COLOR = {
  'Strong Buy':  '#22c55e',
  'Bullish':     '#4ade80',
  'Neutral':     '#94a3b8',
  'Bearish':     '#f87171',
  'Strong Sell': '#ef4444',
}

function ScoreBar({ value, max = 1 }) {
  const pct = Math.abs(value / max) * 100
  const color = value >= 0 ? '#22c55e' : '#ef4444'
  const isPos = value >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          [isPos ? 'left' : 'right']: '50%',
          width: `${pct / 2}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, width: '1px', height: '100%', background: '#334155' }} />
      </div>
      <span style={{ color, fontSize: '0.75rem', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
        {value > 0 ? '+' : ''}{(value * 100).toFixed(0)}
      </span>
    </div>
  )
}

function SignalRow({ label, score }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
      <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{label}</span>
      <ScoreBar value={score} />
    </div>
  )
}

function StockCard({ stock, onSelect }) {
  const isBull = stock.composite_score >= 0
  const borderColor = isBull ? '#166534' : '#7f1d1d'
  const verdictColor = VERDICT_COLOR[stock.verdict] || '#94a3b8'

  return (
    <div
      onClick={() => onSelect(stock.ticker)}
      style={{
        background: '#0f172a',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isBull ? '#22c55e' : '#ef4444'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor; e.currentTarget.style.transform = 'none' }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1rem' }}>{stock.ticker}</span>
          <span style={{ color: '#94a3b8', fontSize: '0.82rem', marginLeft: '8px' }}>${stock.price}</span>
          <span style={{
            color: stock.change_pct >= 0 ? '#4ade80' : '#f87171',
            fontSize: '0.78rem', marginLeft: '6px'
          }}>
            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
          </span>
        </div>
        <span style={{
          color: verdictColor,
          fontSize: '0.72rem',
          fontWeight: 600,
          background: `${verdictColor}22`,
          padding: '2px 8px',
          borderRadius: '4px',
        }}>
          {stock.verdict}
        </span>
      </div>

      {/* Composite score */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ color: '#475569', fontSize: '0.7rem', marginBottom: '3px' }}>COMPOSITE</div>
        <ScoreBar value={stock.composite_score} />
      </div>

      {/* Signal breakdown */}
      <div style={{ marginBottom: '10px' }}>
        <SignalRow label="📈 Options"  score={stock.signals.options.score} />
        <SignalRow label="👤 Insider"  score={stock.signals.insider.score} />
        <SignalRow label="🏦 Inst."    score={stock.signals.institution.score} />
      </div>

      {/* Signal conflict badge */}
      {stock.conflicts?.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          {stock.conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: '0.68rem', color: '#f59e0b', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: '4px', padding: '3px 6px', marginBottom: '3px' }}>
              ⚠ {c.description}
            </div>
          ))}
        </div>
      )}

      {/* Key reasons */}
      {stock.top_reasons.length > 0 && (
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
          {stock.top_reasons.slice(0, 2).map((r, i) => (
            <div key={i} style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '2px' }}>
              • {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailPanel({ ticker, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    fetch(`${API}/ticker/${ticker}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker])

  if (!ticker) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #334155', borderRadius: '12px',
        padding: '24px', width: '560px', maxHeight: '80vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#60a5fa' }}>{ticker} — Signal Detail</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>

        {loading ? <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Loading…</div> : data && (
          <>
            {/* Scores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Composite', value: data.composite_score, color: VERDICT_COLOR[data.verdict] },
                { label: 'Options',   value: data.signals.options.score },
                { label: 'Insider',   value: data.signals.insider.score },
                { label: 'Inst.',     value: data.signals.institution.score },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#1e293b', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontSize: '0.68rem', marginBottom: '4px' }}>{label}</div>
                  <div style={{ color: color || (value >= 0 ? '#22c55e' : '#ef4444'), fontSize: '1.1rem', fontWeight: 700 }}>
                    {value > 0 ? '+' : ''}{(value * 100).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>

            {/* Options detail */}
            <Section title="📈 Options Flow">
              <Row label="Put/Call Ratio" value={data.signals.options.pcr} note={data.signals.options.pcr < 0.7 ? 'Bullish' : data.signals.options.pcr > 1.2 ? 'Bearish' : 'Neutral'} />
              <Row label="Call Volume" value={data.signals.options.call_volume?.toLocaleString()} />
              <Row label="Put Volume"  value={data.signals.options.put_volume?.toLocaleString()} />
              <Row label="Unusual Calls" value={data.signals.options.unusual_calls} />
              <Row label="Unusual Puts"  value={data.signals.options.unusual_puts} />
              <Row label="IV Skew (Put−Call)" value={data.signals.options.iv_skew} note={data.signals.options.iv_skew > 0.1 ? 'Bearish skew' : 'Normal'} />
            </Section>

            {/* Insider detail */}
            <Section title="👤 Insider Activity (90 days)">
              <Row label="Purchases" value={data.signals.insider.buy_count} note={data.signals.insider.buy_value > 0 ? `$${(data.signals.insider.buy_value/1e6).toFixed(1)}M` : ''} />
              <Row label="Sales"     value={data.signals.insider.sell_count} note={data.signals.insider.sell_value > 0 ? `$${(data.signals.insider.sell_value/1e6).toFixed(1)}M` : ''} />
              <Row label="Net Value" value={data.signals.insider.net_value > 0 ? `+$${(data.signals.insider.net_value/1e6).toFixed(1)}M` : `−$${(Math.abs(data.signals.insider.net_value)/1e6).toFixed(1)}M`} />
              {data.signals.insider.buyers?.slice(0, 3).map((b, i) => (
                <Row key={i} label={b.name} value={`${b.shares?.toLocaleString()} shares`} note={b.role} />
              ))}
            </Section>

            {/* Institutional detail */}
            <Section title="🏦 Institutional Positioning">
              <Row label="% Institutionally Held" value={`${data.signals.institution.inst_pct_held}%`} />
              <Row label="Avg Position Change" value={`${data.signals.institution.avg_position_change > 0 ? '+' : ''}${data.signals.institution.avg_position_change}%`} note={data.signals.institution.avg_position_change > 0 ? 'Accumulating' : 'Distributing'} />
              {data.signals.institution.top_holders?.slice(0, 3).map((h, i) => (
                <Row key={i} label={h.name.split(' ').slice(0, 2).join(' ')} value={`${h.pct_change > 0 ? '+' : ''}${(h.pct_change * 100).toFixed(1)}%`} />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #0f172a' }}>
      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>
        {value ?? '—'}
        {note && <span style={{ color: '#64748b', fontSize: '0.72rem', marginLeft: '6px' }}>{note}</span>}
      </span>
    </div>
  )
}

export default function SmartMoneyScanner() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // all | options | insider | institution

  const load = async (refresh = false) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/scan${refresh ? '?refresh=true' : ''}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filterStocks = (stocks) => {
    if (filter === 'all') return stocks
    return stocks.filter(s => {
      if (filter === 'options')     return Math.abs(s.signals.options.score) > 0.3
      if (filter === 'insider')     return Math.abs(s.signals.insider.score) > 0.3
      if (filter === 'institution') return Math.abs(s.signals.institution.score) > 0.3
      return true
    })
  }

  return (
    <div style={{ padding: '1.5rem', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem' }}>Smart Money Scanner</h2>
          {data && <span style={{ color: '#475569', fontSize: '0.75rem' }}>
            {data.scanned} stocks scanned · Last updated {new Date(data.last_updated).toLocaleTimeString()}
          </span>}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Filter */}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}>
            <option value="all">All signals</option>
            <option value="options">Strong options flow</option>
            <option value="insider">Strong insider activity</option>
            <option value="institution">Strong institutional</option>
          </select>

          <button onClick={() => load(true)} disabled={loading}
            style={{ background: loading ? '#1e293b' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {loading ? '⟳ Scanning…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem', padding: '10px', background: '#450a0a', borderRadius: '6px' }}>{error}</div>}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔍</div>
          <div style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '8px' }}>Scanning {75}+ stocks…</div>
          <div style={{ fontSize: '0.85rem' }}>Analyzing options flow, insider transactions, and institutional positioning.</div>
          <div style={{ fontSize: '0.8rem', marginTop: '8px', color: '#475569' }}>First scan takes ~30 seconds. Results cached for 1 hour.</div>
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Bullish */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px', background: 'linear-gradient(135deg, #052e16, #0f172a)', borderRadius: '8px', border: '1px solid #166534' }}>
              <span style={{ fontSize: '1.1rem' }}>📈</span>
              <div>
                <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.9rem' }}>BULLISH OPPORTUNITIES</div>
                <div style={{ color: '#475569', fontSize: '0.72rem' }}>{filterStocks(data.bullish).length} stocks with positive confluence</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {filterStocks(data.bullish).map(s => (
                <StockCard key={s.ticker} stock={s} onSelect={setSelectedTicker} />
              ))}
              {filterStocks(data.bullish).length === 0 && (
                <div style={{ color: '#475569', textAlign: 'center', padding: '2rem' }}>No stocks match this filter</div>
              )}
            </div>
          </div>

          {/* Bearish */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px', background: 'linear-gradient(135deg, #450a0a, #0f172a)', borderRadius: '8px', border: '1px solid #7f1d1d' }}>
              <span style={{ fontSize: '1.1rem' }}>📉</span>
              <div>
                <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>BEARISH WATCH</div>
                <div style={{ color: '#475569', fontSize: '0.72rem' }}>{filterStocks(data.bearish).length} stocks with negative confluence</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {filterStocks(data.bearish).map(s => (
                <StockCard key={s.ticker} stock={s} onSelect={setSelectedTicker} />
              ))}
              {filterStocks(data.bearish).length === 0 && (
                <div style={{ color: '#475569', textAlign: 'center', padding: '2rem' }}>No stocks match this filter</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <DetailPanel ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />

      {data && (
        <div style={{ marginTop: '2rem', padding: '12px 16px', background: '#0f172a', borderRadius: '8px', color: '#475569', fontSize: '0.75rem' }}>
          <strong style={{ color: '#64748b' }}>How scores work:</strong> Composite = Options (40%) + Insider (35%) + Institutional (25%).
          Score +100 = maximum bullish confluence. Score −100 = maximum bearish confluence.
          Insider sells are common (diversification) — weight them alongside options and institutional for a full picture.
          Click any card for full signal detail.
        </div>
      )}
    </div>
  )
}
