import { useState } from 'react'

const API = '/api/v1/institutional'

export default function FlowView() {
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const search = async () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await fetch(`${API}/flow/${t}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const flowColor = data?.net_flow === 'accumulating' ? '#22c55e' : data?.net_flow === 'distributing' ? '#ef4444' : '#94a3b8'

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>🌊 Institutional Fund Flow</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter ticker (e.g. NVDA)"
          style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '0.9rem' }} />
        <button onClick={search} disabled={loading}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {loading ? '…' : 'Analyze'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '10px', background: '#450a0a', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Flow summary */}
          <div style={{ background: '#0f172a', border: `1px solid ${flowColor}44`, borderRadius: '10px', padding: '20px' }}>
            <div style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: '8px' }}>NET INSTITUTIONAL FLOW</div>
            <div style={{ color: flowColor, fontWeight: 700, fontSize: '1.6rem', textTransform: 'uppercase', marginBottom: '4px' }}>
              {data.net_flow}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Avg position change: <span style={{ color: data.avg_position_change_pct > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                {data.avg_position_change_pct > 0 ? '+' : ''}{data.avg_position_change_pct}%
              </span>
            </div>
            <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '8px' }}>
              Inst. held: {data.ownership?.institutional_pct}%
            </div>
          </div>

          {/* Buyers vs sellers counts */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '10px' }}>
            {data.buying?.length > 0 && (
              <div style={{ background: '#052e1633', border: '1px solid #166534', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 600, marginBottom: '8px' }}>📈 ADDING POSITIONS</div>
                {data.buying.slice(0, 3).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '0.82rem', marginBottom: '4px' }}>
                    <span>{f.name?.split(' ').slice(0, 3).join(' ')}</span>
                    <span style={{ color: '#4ade80' }}>+{f.change}%</span>
                  </div>
                ))}
              </div>
            )}
            {data.selling?.length > 0 && (
              <div style={{ background: '#450a0a33', border: '1px solid #7f1d1d', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 600, marginBottom: '8px' }}>📉 TRIMMING POSITIONS</div>
                {data.selling.slice(0, 3).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '0.82rem', marginBottom: '4px' }}>
                    <span>{f.name?.split(' ').slice(0, 3).join(' ')}</span>
                    <span style={{ color: '#f87171' }}>{f.change}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New / closed positions */}
          {(data.new_positions?.length > 0 || data.closed_positions?.length > 0) && (
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {data.new_positions?.length > 0 && (
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 600, marginBottom: '8px' }}>🆕 NEW POSITIONS</div>
                  {data.new_positions.map((n, i) => <div key={i} style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '3px' }}>{n}</div>)}
                </div>
              )}
              {data.closed_positions?.length > 0 && (
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 600, marginBottom: '8px' }}>❌ CLOSED POSITIONS</div>
                  {data.closed_positions.map((n, i) => <div key={i} style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '3px' }}>{n}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
