import { useState, useEffect } from 'react'

const API = '/api/v1/alerts'

const TYPE_LABELS = {
  price:                 'Price',
  reversal_confidence:   'Reversal Confidence',
  smart_money_score:     'Smart Money Score',
}

const TYPE_SUFFIX = {
  price:                 '$',
  reversal_confidence:   '',
  smart_money_score:     '',
}

export default function AlertsManager() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [triggered, setTriggered] = useState([])

  // Form state
  const [ticker, setTicker] = useState('')
  const [type, setType] = useState('price')
  const [condition, setCondition] = useState('above')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const load = () => {
    fetch(`${API}/list`).then(r => r.json()).then(d => setAlerts(d.alerts || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const addAlert = async e => {
    e.preventDefault()
    setFormLoading(true)
    try {
      await fetch(`${API}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, type, condition, value: parseFloat(value), note }),
      })
      setTicker(''); setValue(''); setNote('')
      load()
    } finally {
      setFormLoading(false)
    }
  }

  const remove = async id => {
    await fetch(`${API}/${id}`, { method: 'DELETE' }); load()
  }

  const reset = async id => {
    await fetch(`${API}/${id}/reset`, { method: 'POST' }); load()
  }

  const checkNow = async () => {
    setChecking(true)
    const res = await fetch(`${API}/check`)
    const data = await res.json()
    setTriggered(data.triggered || [])
    setChecking(false)
    load()
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem' }}>🔔 Price & Signal Alerts</h2>
        <button onClick={checkNow} disabled={checking}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 16px', cursor: checking ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
          {checking ? '⟳ Checking…' : '⚡ Check Now'}
        </button>
      </div>

      {triggered.length > 0 && (
        <div style={{ background: '#3730a333', border: '1px solid #4f46e5', borderRadius: '10px', padding: '14px', marginBottom: '1.5rem' }}>
          <div style={{ color: '#818cf8', fontWeight: 600, marginBottom: '8px' }}>⚡ {triggered.length} alert{triggered.length > 1 ? 's' : ''} triggered!</div>
          {triggered.map(a => (
            <div key={a.id} style={{ color: '#e2e8f0', fontSize: '0.85rem', marginBottom: '4px' }}>
              • {a.ticker} — {TYPE_LABELS[a.type]} {a.condition} {a.value} {a.note && `(${a.note})`}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={addAlert} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '16px', marginBottom: '1.5rem' }}>
        <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px' }}>➕ New Alert</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1fr 1.5fr auto', gap: '8px', alignItems: 'end' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>TICKER</div>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} required placeholder="AAPL"
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>TYPE</div>
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.82rem', boxSizing: 'border-box' }}>
              <option value="price">Price</option>
              <option value="reversal_confidence">Reversal Confidence</option>
              <option value="smart_money_score">Smart Money Score</option>
            </select>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>CONDITION</div>
            <select value={condition} onChange={e => setCondition(e.target.value)}
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.82rem', boxSizing: 'border-box' }}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>VALUE {type === 'price' ? '($)' : '(0-1)'}</div>
            <input type="number" value={value} onChange={e => setValue(e.target.value)} required placeholder={type === 'price' ? '200' : '0.5'} step="any"
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', marginBottom: '4px' }}>NOTE (opt.)</div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. breakout level"
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={formLoading}
            style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', padding: '7px 16px', cursor: formLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
            {formLoading ? '…' : 'Set'}
          </button>
        </div>
      </form>

      {loading && <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Loading alerts…</div>}

      {!loading && alerts.length === 0 && (
        <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔔</div>
          <div>No alerts set. Create one above.</div>
        </div>
      )}

      {alerts.length > 0 && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1.2fr 1fr 1fr 2fr auto', padding: '10px 16px', background: '#1e293b', color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Ticker</span><span>Type</span><span>Condition</span><span>Value</span><span>Note</span><span style={{textAlign:'right'}}>Status</span>
          </div>
          {alerts.map(a => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '70px 1.2fr 1fr 1fr 2fr auto', padding: '10px 16px', borderTop: '1px solid #1e293b', alignItems: 'center' }}>
              <span style={{ color: '#60a5fa', fontWeight: 700 }}>{a.ticker}</span>
              <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{TYPE_LABELS[a.type]}</span>
              <span style={{ color: a.condition === 'above' ? '#4ade80' : '#f87171', fontSize: '0.82rem', textTransform: 'capitalize' }}>{a.condition}</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{a.value}</span>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{a.note || '—'}</span>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                {a.triggered ? (
                  <>
                    <span style={{ color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600, background: '#f59e0b22', padding: '2px 6px', borderRadius: '4px' }}>✓ Triggered</span>
                    <button onClick={() => reset(a.id)} title="Reset"
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>
                      Reset
                    </button>
                  </>
                ) : (
                  <span style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 600, background: '#22c55e22', padding: '2px 6px', borderRadius: '4px' }}>● Active</span>
                )}
                <button onClick={() => remove(a.id)} title="Delete"
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.9rem' }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'}
                  onMouseLeave={e => e.target.style.color = '#475569'}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
