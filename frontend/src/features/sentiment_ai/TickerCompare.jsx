import { useState } from 'react'
import { api } from '../../core/api'

const DEFAULTS = 'AAPL,MSFT,NVDA,TSLA,AMZN'

const LABEL_COLOR = {
  Bullish:          '#22c55e',
  'Mildly Bullish': '#86efac',
  Neutral:          '#94a3b8',
  'Mildly Bearish': '#fca5a5',
  Bearish:          '#ef4444',
}

function CompoundBar({ value, maxAbs }) {
  const color = value > 0.05 ? '#22c55e' : value < -0.05 ? '#ef4444' : '#94a3b8'
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 50
  const isPos = value >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 100, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: isPos ? '50%' : `${50 - pct / 2}%`, width: `${pct / 2}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 12, color, minWidth: 50 }}>
        {value > 0 ? '+' : ''}{value.toFixed(3)}
      </span>
    </div>
  )
}

export default function TickerCompare() {
  const [input, setInput] = useState(DEFAULTS)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function compare() {
    const tickers = input.trim()
    if (!tickers) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const data = await api.get(`/sentiment_ai/compare?tickers=${encodeURIComponent(tickers)}&max_items=10`)
      setResults(data.comparisons)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const maxAbs = results
    ? Math.max(...results.map(r => Math.abs(r.aggregate?.avg_compound ?? 0)), 0.01)
    : 0.01

  return (
    <div className="pad" style={{ maxWidth: 800 }}>
      <h2 className="ai-section-title">⚖ Sentiment Comparison</h2>
      <p className="ai-section-sub" style={{ marginBottom: 16 }}>
        Compare news sentiment across multiple tickers side by side.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="AAPL,MSFT,NVDA,TSLA"
          style={{
            flex: 1, background: '#0f172a', border: '1px solid #334155',
            borderRadius: 8, color: '#e2e8f0', padding: '9px 13px', fontSize: 13, outline: 'none',
          }}
          onKeyDown={e => e.key === 'Enter' && compare()}
        />
        <button className="btn-primary" onClick={compare} disabled={loading}>
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r, i) => (
            <div key={r.ticker} style={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <div style={{ width: 28, textAlign: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                #{i + 1}
              </div>
              <div style={{ width: 56, fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>{r.ticker}</div>
              {r.aggregate ? (
                <>
                  <div style={{ flex: 1 }}>
                    <CompoundBar value={r.aggregate.avg_compound} maxAbs={maxAbs} />
                  </div>
                  <div>
                    <span style={{
                      background: (LABEL_COLOR[r.aggregate.label] || '#94a3b8') + '22',
                      color: LABEL_COLOR[r.aggregate.label] || '#94a3b8',
                      border: `1px solid ${(LABEL_COLOR[r.aggregate.label] || '#94a3b8')}55`,
                      borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px',
                    }}>
                      {r.aggregate.label}
                    </span>
                  </div>
                  <div style={{ minWidth: 80, textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#22c55e' }}>{r.aggregate.bull_pct}% bull</span>
                    {' · '}
                    <span style={{ fontSize: 11, color: '#ef4444' }}>{r.aggregate.bear_pct}% bear</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.article_count} articles</div>
                </>
              ) : (
                <span style={{ fontSize: 12, color: '#64748b' }}>{r.error || 'No data'}</span>
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            Sorted by avg compound score (most bullish first) · FinBERT · Not financial advice
          </div>
        </div>
      )}
    </div>
  )
}
