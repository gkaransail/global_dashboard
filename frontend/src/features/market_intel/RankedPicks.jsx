import { useState, useEffect } from 'react'

const API = '/api/v1/market_intel'

const VERDICT_COLOR = {
  'Strong Buy':  '#22c55e',
  'Bullish':     '#4ade80',
  'Neutral':     '#94a3b8',
  'Bearish':     '#f87171',
  'Strong Sell': '#ef4444',
}

function ScoreBar({ value }) {
  const pct = Math.abs(value) * 50
  const color = value >= 0 ? '#22c55e' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '5px', background: '#1e293b', borderRadius: '3px', position: 'relative' }}>
        <div style={{
          position: 'absolute', [value >= 0 ? 'left' : 'right']: '50%',
          width: `${pct}%`, height: '100%', background: color, borderRadius: '3px',
        }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, width: '1px', height: '100%', background: '#334155' }} />
      </div>
      <span style={{ color, fontSize: '0.72rem', fontWeight: 600, minWidth: '34px', textAlign: 'right' }}>
        {value > 0 ? '+' : ''}{(value * 100).toFixed(0)}
      </span>
    </div>
  )
}

function PickCard({ stock }) {
  const isBull = stock.composite_score >= 0
  const verdictColor = VERDICT_COLOR[stock.verdict] || '#94a3b8'
  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${isBull ? '#166534' : '#7f1d1d'}`,
      borderRadius: '10px', padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{stock.ticker}</span>
          <span style={{ color: '#94a3b8', fontSize: '0.82rem', marginLeft: '8px' }}>${stock.price}</span>
          <span style={{ color: stock.change_pct >= 0 ? '#4ade80' : '#f87171', fontSize: '0.78rem', marginLeft: '6px' }}>
            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
          </span>
        </div>
        <span style={{ color: verdictColor, fontSize: '0.72rem', fontWeight: 600, background: `${verdictColor}22`, padding: '2px 8px', borderRadius: '4px' }}>
          {stock.verdict}
        </span>
      </div>
      <ScoreBar value={stock.composite_score} />
      {stock.top_reasons?.length > 0 && (
        <div style={{ marginTop: '8px', borderTop: '1px solid #1e293b', paddingTop: '6px' }}>
          {stock.top_reasons.slice(0, 2).map((r, i) => (
            <div key={i} style={{ color: '#64748b', fontSize: '0.7rem' }}>• {r}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RankedPicks() {
  const [horizon, setHorizon] = useState('1m')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async (h = horizon) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/scan?horizon=${h}&limit=15`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(horizon) }, [horizon])

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem' }}>Market Intelligence — Ranked Picks</h2>
          {data && <span style={{ color: '#475569', fontSize: '0.75rem' }}>
            {data.scanned} stocks · last updated {new Date(data.last_updated).toLocaleTimeString()}
          </span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['1w', '1m', '3m'].map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              style={{ background: horizon === h ? '#3b82f6' : '#1e293b', color: horizon === h ? '#fff' : '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              {h.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: '#f87171', padding: '10px', background: '#450a0a', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {loading && <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎯</div>
        <div>Scanning with {horizon.toUpperCase()} horizon weights…</div>
        <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '8px' }}>First scan takes ~30s. Results cached 30 min.</div>
      </div>}

      {data && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: '10px', fontSize: '0.85rem' }}>📈 TOP BULLISH PICKS</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {data.bullish.map(s => <PickCard key={s.ticker} stock={s} />)}
              {data.bullish.length === 0 && <div style={{ color: '#475569', padding: '2rem', textAlign: 'center' }}>No bullish signals found</div>}
            </div>
          </div>
          <div>
            <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: '10px', fontSize: '0.85rem' }}>📉 TOP BEARISH WATCH</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {data.bearish.map(s => <PickCard key={s.ticker} stock={s} />)}
              {data.bearish.length === 0 && <div style={{ color: '#475569', padding: '2rem', textAlign: 'center' }}>No bearish signals found</div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '12px', background: '#0f172a', borderRadius: '8px', color: '#475569', fontSize: '0.75rem' }}>
        <strong style={{ color: '#64748b' }}>Horizon weights:</strong>{' '}
        1W: Options 50% · Reversal 25% · Smart Money 15% · Insider 10% &nbsp;|&nbsp;
        1M: Options 40% · Reversal 30% · Smart Money 20% · Insider 10% &nbsp;|&nbsp;
        3M: Options 25% · Reversal 35% · Smart Money 25% · Insider 15%
      </div>
    </div>
  )
}
