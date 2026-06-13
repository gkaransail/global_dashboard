import { useState, useEffect } from 'react'

const API = '/api/v1/market_intel'

function MacroCard({ label, icon, price, change_pct, change_abs }) {
  const isPos = (change_pct ?? 0) >= 0
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>{icon} {label}</div>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.1rem' }}>
            {price != null ? price.toFixed(2) : '—'}
          </div>
        </div>
        {change_pct != null && (
          <div style={{ color: isPos ? '#4ade80' : '#f87171', fontSize: '0.82rem', fontWeight: 600, textAlign: 'right' }}>
            <div>{isPos ? '+' : ''}{change_pct.toFixed(2)}%</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{isPos ? '+' : ''}{change_abs?.toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectorRow({ ticker, name, change_pct, above_200ma }) {
  const isPos = (change_pct ?? 0) >= 0
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
      <div>
        <span style={{ color: '#60a5fa', fontWeight: 600, marginRight: '8px' }}>{ticker}</span>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span style={{ color: isPos ? '#4ade80' : '#f87171', fontSize: '0.85rem' }}>
          {isPos ? '+' : ''}{change_pct?.toFixed(2)}%
        </span>
        <span style={{ fontSize: '0.72rem', color: above_200ma ? '#4ade80' : '#f87171', background: above_200ma ? '#052e1633' : '#450a0a33', padding: '2px 6px', borderRadius: '4px' }}>
          {above_200ma ? 'Above 200MA' : 'Below 200MA'}
        </span>
      </div>
    </div>
  )
}

export default function MarketOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API}/overview`)
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>Loading market overview…</div>
  if (error) return <div style={{ padding: '1.5rem', color: '#f87171' }}>{error}</div>
  if (!data) return null

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>🌐 Market Overview</h2>

      {/* Macro tickers */}
      {data.macro && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Macro Indicators</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {Object.entries(data.macro).map(([key, m]) => (
              <MacroCard key={key} {...m} />
            ))}
          </div>
        </div>
      )}

      {/* Sector performance */}
      {data.sectors && (
        <div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Sector Performance</div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '0 16px' }}>
            {data.sectors.map(s => <SectorRow key={s.ticker} {...s} />)}
          </div>
        </div>
      )}
    </div>
  )
}
