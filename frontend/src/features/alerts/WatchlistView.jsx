import { useState, useEffect } from 'react'

const API = '/api/v1/alerts'

export default function WatchlistView() {
  const [items, setItems] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    fetch(`${API}/watchlist`).then(r => r.json()).then(d => setItems(d.items || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    await fetch(`${API}/watchlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: t }) })
    setInput(''); load()
  }

  const remove = async (ticker) => {
    await fetch(`${API}/watchlist/${ticker}`, { method: 'DELETE' }); load()
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontSize: '1.1rem' }}>👁 Watchlist</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add ticker (e.g. NVDA)"
          style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '8px', padding: '8px 14px', fontSize: '0.9rem' }} />
        <button onClick={add}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
          Add
        </button>
      </div>

      {loading && <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Loading…</div>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#475569', padding: '4rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👁</div>
          <div>Add tickers to your watchlist to track them here.</div>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
          {items.map(item => (
            <div key={item.ticker} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px', position: 'relative' }}>
              <button onClick={() => remove(item.ticker)}
                style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.9rem' }}
                onMouseEnter={e => e.target.style.color = '#ef4444'}
                onMouseLeave={e => e.target.style.color = '#475569'}>✕</button>
              <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1rem' }}>{item.ticker}</div>
              {item.price != null ? (
                <>
                  <div style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 600, marginTop: '6px' }}>${item.price}</div>
                  <div style={{ color: item.change_pct >= 0 ? '#4ade80' : '#f87171', fontSize: '0.82rem', marginTop: '2px' }}>
                    {item.change_pct >= 0 ? '+' : ''}{item.change_pct}% ({item.change_abs >= 0 ? '+' : ''}{item.change_abs})
                  </div>
                </>
              ) : <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '6px' }}>Price unavailable</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
