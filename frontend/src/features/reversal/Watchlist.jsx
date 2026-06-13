import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const DIR_COLOR = { bullish_reversal: 'var(--bull)', bearish_reversal: 'var(--bear)', neutral: 'var(--neutral)' }
const DIR_ICON  = { bullish_reversal: '🟢', bearish_reversal: '🔴', neutral: '⚪' }

export default function Watchlist() {
  const { watchlist, setTicker, addToWatchlist, removeFromWatchlist } = useStore()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [scanned, setScanned] = useState(false)

  async function scan() {
    if (!watchlist.length) return
    setLoading(true)
    try {
      const d = await api.post('/reversal/watchlist', { tickers: watchlist, explain: false })
      setResults(d)
      setScanned(true)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function add() {
    const t = input.trim().toUpperCase()
    if (t) { addToWatchlist(t); setInput('') }
  }

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add ticker..."
          maxLength={10}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
            padding: '8px 12px', borderRadius: 6, fontSize: 13, width: 140,
          }}
        />
        <button onClick={add} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          Add
        </button>
        <button onClick={scan} style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          {loading ? 'Scanning...' : 'Scan All'}
        </button>
      </div>

      {/* Chip list */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {watchlist.map(t => {
          const res = results.find(r => r.ticker === t)
          return (
            <div key={t} className="watchlist-chip" onClick={() => res && setTicker(t)}>
              {res ? DIR_ICON[res.direction] : '—'}
              <span>{t}</span>
              {res && <span style={{ color: DIR_COLOR[res.direction], fontSize: 12 }}>{Math.round(res.confidence * 100)}%</span>}
              <span className="watchlist-chip-remove" onClick={e => { e.stopPropagation(); removeFromWatchlist(t) }}>✕</span>
            </div>
          )
        })}
      </div>

      {/* Results table */}
      {scanned && results.length > 0 && (
        <div>
          <div className="section-title">Results — sorted by confidence</div>
          <div className="signals-panel">
            {results.map(r => (
              <div key={r.ticker} className="signal-row" style={{ cursor: 'pointer' }} onClick={() => setTicker(r.ticker)}>
                <div className="signal-dot" style={{ background: DIR_COLOR[r.direction] }} />
                <div>
                  <div className="signal-name">{r.ticker}</div>
                  <div className="signal-expl">{r.signal_counts.bullish}B / {r.signal_counts.bearish}B signals · {r.strength}</div>
                </div>
                <div className="signal-strength" style={{ color: DIR_COLOR[r.direction] }}>
                  {DIR_ICON[r.direction]} {Math.round(r.confidence * 100)}%
                </div>
                <div className="signal-value" style={{ color: DIR_COLOR[r.direction], fontSize: 12 }}>
                  {r.direction.replace('_', ' ').replace('reversal', '').trim()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
