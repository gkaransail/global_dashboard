import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const LABEL_COLOR = {
  Bullish:       '#22c55e',
  'Mildly Bullish': '#86efac',
  Neutral:       '#94a3b8',
  'Mildly Bearish': '#fca5a5',
  Bearish:       '#ef4444',
}

function SentimentBadge({ label }) {
  const color = LABEL_COLOR[label] || '#94a3b8'
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px',
    }}>
      {label}
    </span>
  )
}

function CompoundBar({ value }) {
  const norm = ((value + 1) / 2) * 100
  const color = value > 0.05 ? '#22c55e' : value < -0.05 ? '#ef4444' : '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <div style={{ flex: 1, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${norm}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, minWidth: 40, textAlign: 'right' }}>
        {value > 0 ? '+' : ''}{value.toFixed(3)}
      </span>
    </div>
  )
}

export default function NewsSentiment() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchSentiment() }, [ticker])

  async function fetchSentiment() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const result = await api.get(`/sentiment_ai/news/${ticker}?max_items=15`)
      setData(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pad" style={{ maxWidth: 900 }}>
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">📰 News Sentiment — {ticker}</h2>
          <p className="ai-section-sub">FinBERT sentiment analysis on recent headlines and summaries</p>
        </div>
        <button className="btn-secondary" onClick={fetchSentiment} disabled={loading}>
          {loading ? 'Analyzing…' : '↺ Refresh'}
        </button>
      </div>

      {loading && <div className="ai-loading-card"><div className="ai-loading-icon">🧬</div><div className="ai-loading-text">Running FinBERT on {ticker} headlines…</div></div>}
      {error && <div className="error-box">⚠ {error}</div>}

      {data && (
        <>
          {/* Aggregate */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>AGGREGATE SENTIMENT</div>
                <SentimentBadge label={data.aggregate.label} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>AVG COMPOUND</div>
                <span style={{ fontSize: 18, fontWeight: 700, color: data.aggregate.avg_compound > 0 ? '#22c55e' : data.aggregate.avg_compound < 0 ? '#ef4444' : '#94a3b8' }}>
                  {data.aggregate.avg_compound > 0 ? '+' : ''}{data.aggregate.avg_compound.toFixed(3)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{data.aggregate.bull_pct}%</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Bullish</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8' }}>{Math.round(data.aggregate.neutral_count / data.aggregate.total * 100)}%</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Neutral</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{data.aggregate.bear_pct}%</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Bearish</div>
                </div>
              </div>
            </div>
          </div>

          {/* Articles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.articles.map((a, i) => (
              <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4, lineHeight: 1.4 }}>{a.title}</div>
                    {a.published && <div style={{ fontSize: 11, color: '#475569' }}>{a.published}</div>}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <SentimentBadge label={a.sentiment?.label === 'positive' ? 'Bullish' : a.sentiment?.label === 'negative' ? 'Bearish' : 'Neutral'} />
                    <CompoundBar value={a.sentiment?.compound ?? 0} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
            FinBERT (ProsusAI/finbert) · {data.aggregate.total} articles · Not financial advice
          </div>
        </>
      )}
    </div>
  )
}
