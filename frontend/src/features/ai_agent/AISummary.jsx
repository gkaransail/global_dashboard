import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'
import SetupCard from './SetupCard'

// Animated "thinking" dots
function ThinkingDots() {
  return (
    <span className="thinking-dots">
      <span>.</span><span>.</span><span>.</span>
    </span>
  )
}

export default function AISummary() {
  const ticker = useStore(s => s.ticker)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noApiKey, setNoApiKey] = useState(false)
  const [generatedAt, setGeneratedAt] = useState(null)
  const prevTickerRef = useRef(null)

  useEffect(() => {
    // Auto-fetch when ticker changes (unless it's the very first render and we
    // already have a result for this ticker)
    if (prevTickerRef.current !== ticker) {
      prevTickerRef.current = ticker
      setSummary(null)
      setError(null)
      setNoApiKey(false)
      fetchSummary()
    }
  }, [ticker])

  // Fetch on first mount too
  useEffect(() => {
    fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchSummary() {
    setLoading(true)
    setError(null)
    setNoApiKey(false)
    setSummary(null)
    try {
      const data = await api.post('/ai_agent/summary', { ticker })
      if (data.error === 'ANTHROPIC_API_KEY not configured') {
        setNoApiKey(true)
      } else if (data.error) {
        setError(data.error)
      } else {
        setSummary(data.summary)
        setGeneratedAt(new Date())
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (noApiKey) {
    return (
      <div className="pad">
        <SetupCard />
      </div>
    )
  }

  return (
    <div className="pad ai-summary-root">
      {/* Header */}
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">🤖 AI Summary — {ticker}</h2>
          <p className="ai-section-sub">
            Quick AI-generated market overview powered by Claude
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={fetchSummary}
          disabled={loading}
        >
          {loading ? 'Generating…' : '↺ Regenerate'}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="ai-loading-card">
          <div className="ai-loading-icon">🤖</div>
          <div className="ai-loading-text">
            Analyzing {ticker}<ThinkingDots />
          </div>
          <div className="ai-loading-sub">
            Fetching price data, technicals, and fundamentals
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="error-box">
          <span>⚠ Error: {error}</span>
          <button className="btn-secondary" style={{ marginLeft: 12 }} onClick={fetchSummary}>
            Retry
          </button>
        </div>
      )}

      {/* Result */}
      {!loading && summary && (
        <div className="ai-result-card">
          <div className="ai-result-header">
            <span className="ai-result-label">AI Research Note</span>
            {generatedAt && (
              <span className="ai-result-timestamp">
                Generated at {generatedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="ai-result-body">
            <pre className="ai-summary-text">{summary}</pre>
          </div>
          <div className="ai-result-footer">
            <span>Powered by Claude · Not financial advice · Data via yfinance</span>
          </div>
        </div>
      )}
    </div>
  )
}
