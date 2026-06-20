import { useState, useEffect } from 'react'

const API = '/api/v1/institutional'

const FLOW_COLOR = { accumulating: '#22c55e', distributing: '#ef4444', neutral: '#94a3b8' }
const DAYS_OPTIONS = [
  { label: '90d',  value: 90 },
  { label: '180d', value: 180 },
  { label: '1yr',  value: 365 },
]

export default function ScreenerView() {
  const [minPct, setMinPct] = useState(50)
  const [flow, setFlow]     = useState('all')
  const [days, setDays]     = useState(365)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/screener?min_inst_pct=${minPct}&flow=${flow}&days=${days}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setData(json.results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem' }}>🔎 Institutional Screener</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: '#64748b', fontSize: '0.82rem' }}>Min inst %</label>
          <input type="number" value={minPct} onChange={e => setMinPct(Number(e.target.value))} min={0} max={100}
            style={{ width: '60px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '0.85rem' }} />
          <select value={flow} onChange={e => setFlow(e.target.value)}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '5px 10px', fontSize: '0.82rem' }}>
            <option value="all">All flows</option>
            <option value="accumulating">Accumulating</option>
            <option value="distributing">Distributing</option>
          </select>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Filed within:</span>
            {DAYS_OPTIONS.map(d => (
              <button key={d.value} onClick={() => setDays(d.value)} style={{
                padding: '5px 10px', borderRadius: '6px',
                border: `1px solid ${days === d.value ? '#3b82f6' : '#334155'}`,
                background: days === d.value ? 'rgba(59,130,246,.15)' : 'transparent',
                color: days === d.value ? '#60a5fa' : '#64748b',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              }}>
                {d.label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {loading ? '…' : 'Screen'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', padding: '10px', background: '#450a0a', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {data && (
        <>
          <div style={{ color: '#475569', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            {data.length} stock{data.length !== 1 ? 's' : ''} matched across {65} tracked tickers
          </div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 100px', padding: '10px 16px', background: '#1e293b', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Ticker</span>
              <span style={{ textAlign: 'right' }}>Inst %</span>
              <span style={{ textAlign: 'right' }}>Avg Chg</span>
              <span style={{ textAlign: 'right' }}>Buyers</span>
              <span style={{ textAlign: 'right' }}>Sellers</span>
              <span style={{ textAlign: 'right' }}>Flow</span>
              <span style={{ textAlign: 'right' }}>Last Filing</span>
            </div>
            {data.length === 0 && (
              <div style={{ color: '#475569', textAlign: 'center', padding: '3rem' }}>No stocks match these filters</div>
            )}
            {data.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 100px', padding: '10px 16px', borderTop: '1px solid #1e293b', alignItems: 'center' }}>
                <span style={{ color: '#60a5fa', fontWeight: 700 }}>{r.ticker}</span>
                <span style={{ color: '#94a3b8', textAlign: 'right' }}>{r.institutional_pct}%</span>
                <span style={{ color: r.avg_change_pct >= 0 ? '#4ade80' : '#f87171', textAlign: 'right', fontWeight: 600 }}>
                  {r.avg_change_pct > 0 ? '+' : ''}{r.avg_change_pct}%
                </span>
                <span style={{ color: '#4ade80', textAlign: 'right' }}>{r.buyer_count}</span>
                <span style={{ color: '#f87171', textAlign: 'right' }}>{r.seller_count}</span>
                <span style={{ color: FLOW_COLOR[r.net_flow] || '#94a3b8', textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>{r.net_flow}</span>
                <span style={{ color: '#475569', textAlign: 'right', fontSize: '0.75rem' }}>{r.last_filing || '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
