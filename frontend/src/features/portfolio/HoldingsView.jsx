import { useState, useEffect } from 'react'

const API = '/api/v1/portfolio'

function AddForm({ onAdded }) {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [cost, setCost] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async e => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, shares: parseFloat(shares), cost_basis: parseFloat(cost), added_date: date || undefined }),
      })
      if (!res.ok) throw new Error(await res.text())
      setTicker(''); setShares(''); setCost(''); setDate('')
      onAdded()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '16px', marginBottom: '1.5rem' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px' }}>➕ Add Position</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>TICKER</div>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} required placeholder="AAPL"
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>SHARES</div>
          <input type="number" value={shares} onChange={e => setShares(e.target.value)} required placeholder="100" min="0.001" step="any"
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>COST BASIS</div>
          <input type="number" value={cost} onChange={e => setCost(e.target.value)} required placeholder="150.00" min="0.01" step="any"
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>DATE (opt.)</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ background: '#22c55e', color: '#000', border: 'none', borderRadius: '6px', padding: '7px 18px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
          {loading ? '…' : 'Add'}
        </button>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '8px' }}>{error}</div>}
    </form>
  )
}

export default function HoldingsView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    fetch(`${API}/holdings`)
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const remove = async (id) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' })
    load()
  }

  const summary = data?.summary

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>💼 Portfolio Holdings & P&L</h2>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Cost',    value: `$${summary.total_cost?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
            { label: 'Market Value',  value: `$${summary.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
            { label: 'Unrealized P&L', value: `${summary.total_pnl >= 0 ? '+' : ''}$${summary.total_pnl?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: summary.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
            { label: 'Total Return',  value: `${summary.total_pnl_pct >= 0 ? '+' : ''}${summary.total_pnl_pct?.toFixed(2)}%`, color: summary.total_pnl_pct >= 0 ? '#22c55e' : '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '6px' }}>{label}</div>
              <div style={{ color: color || '#e2e8f0', fontWeight: 700, fontSize: '1.1rem' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <AddForm onAdded={load} />

      {error && <div style={{ color: '#f87171', padding: '10px', background: '#450a0a', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading portfolio…</div>}

      {data?.positions?.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: '#475569', padding: '4rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>💼</div>
          <div>No positions yet. Add your first position above.</div>
        </div>
      )}

      {data?.positions?.length > 0 && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 1fr 40px', padding: '10px 16px', background: '#1e293b', color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Ticker</span><span style={{textAlign:'right'}}>Shares</span><span style={{textAlign:'right'}}>Cost/sh</span><span style={{textAlign:'right'}}>Price</span><span style={{textAlign:'right'}}>Cost Basis</span><span style={{textAlign:'right'}}>Mkt Value</span><span style={{textAlign:'right'}}>P&L</span><span />
          </div>
          {data.positions.map(p => {
            const isPnlPos = (p.unrealized_pnl ?? 0) >= 0
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 1fr 40px', padding: '12px 16px', borderTop: '1px solid #1e293b', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#60a5fa', fontWeight: 700 }}>{p.ticker}</div>
                  <div style={{ color: '#475569', fontSize: '0.68rem' }}>{p.added_date}</div>
                </div>
                <span style={{ color: '#94a3b8', textAlign: 'right' }}>{p.shares}</span>
                <span style={{ color: '#94a3b8', textAlign: 'right' }}>${p.cost_basis}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#e2e8f0' }}>{p.current_price != null ? `$${p.current_price}` : '—'}</div>
                  {p.day_change_pct != null && <div style={{ color: p.day_change_pct >= 0 ? '#4ade80' : '#f87171', fontSize: '0.72rem' }}>
                    {p.day_change_pct >= 0 ? '+' : ''}{p.day_change_pct}%
                  </div>}
                </div>
                <span style={{ color: '#94a3b8', textAlign: 'right' }}>${p.total_cost?.toLocaleString()}</span>
                <span style={{ color: '#e2e8f0', textAlign: 'right' }}>{p.current_value != null ? `$${p.current_value?.toLocaleString()}` : '—'}</span>
                <div style={{ textAlign: 'right' }}>
                  {p.unrealized_pnl != null ? <>
                    <div style={{ color: isPnlPos ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {isPnlPos ? '+' : ''}${p.unrealized_pnl?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ color: isPnlPos ? '#4ade80' : '#f87171', fontSize: '0.72rem' }}>
                      {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct?.toFixed(2)}%
                    </div>
                  </> : <span style={{ color: '#475569' }}>—</span>}
                </div>
                <button onClick={() => remove(p.id)} title="Remove position"
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1rem', padding: '0' }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'}
                  onMouseLeave={e => e.target.style.color = '#475569'}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
