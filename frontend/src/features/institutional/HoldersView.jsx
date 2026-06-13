import { useState } from 'react'

const API = '/api/v1/institutional'

const ACTION_COLOR = {
  new:      '#22c55e',
  adding:   '#4ade80',
  holding:  '#94a3b8',
  trimming: '#f87171',
  closed:   '#ef4444',
}

const ACTION_LABEL = {
  new:      '🆕 New',
  adding:   '📈 Adding',
  holding:  '➡ Holding',
  trimming: '📉 Trimming',
  closed:   '❌ Closed',
}

export default function HoldersView() {
  const [ticker, setTicker] = useState('')
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const search = async () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    setTicker(t); setLoading(true); setError(null); setData(null)
    try {
      const res = await fetch(`${API}/holders/${t}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>🏛 Institutional Holders (13F)</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter ticker (e.g. AAPL)"
          style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '0.9rem' }} />
        <button onClick={search} disabled={loading}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '10px', background: '#450a0a', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {data && (
        <>
          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
            {[
              { label: 'Institutional %', value: `${data.ownership.institutional_pct}%` },
              { label: 'Insider %',       value: `${data.ownership.insider_pct}%` },
              { label: 'Total Holders',   value: data.summary.total_holders },
              { label: 'Net Flow',        value: data.flow.net_flow, color: data.flow.net_flow === 'accumulating' ? '#22c55e' : data.flow.net_flow === 'distributing' ? '#ef4444' : '#94a3b8' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '6px' }}>{label}</div>
                <div style={{ color: color || '#e2e8f0', fontWeight: 700, fontSize: '1.1rem', textTransform: 'capitalize' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Holders table */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', background: '#1e293b', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Fund / Institution</span>
              <span style={{ textAlign: 'right' }}>Shares</span>
              <span style={{ textAlign: 'right' }}>% Held</span>
              <span style={{ textAlign: 'right' }}>Chg %</span>
              <span style={{ textAlign: 'right' }}>Action</span>
            </div>
            {data.holders.map((h, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid #1e293b', alignItems: 'center' }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{h.name}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'right' }}>{h.shares?.toLocaleString()}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'right' }}>{h.pct_outstanding}%</span>
                <span style={{ color: h.pct_change >= 0 ? '#4ade80' : '#f87171', fontSize: '0.82rem', textAlign: 'right', fontWeight: 600 }}>
                  {h.pct_change > 0 ? '+' : ''}{h.pct_change}%
                </span>
                <span style={{ color: ACTION_COLOR[h.action] || '#94a3b8', fontSize: '0.72rem', textAlign: 'right', fontWeight: 600 }}>
                  {ACTION_LABEL[h.action] || h.action}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
