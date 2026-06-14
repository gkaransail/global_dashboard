import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'
import SetupCard from './SetupCard'

const EXAMPLE_QUESTIONS = [
  'What is the technical outlook for this stock?',
  'Is this stock overvalued at current prices?',
  'What are the key risk factors?',
  'How is this company positioned vs competitors?',
  'What does the options market signal about near-term direction?',
  'Are insiders buying or selling recently?',
]

const LOADING_STEPS = [
  'Fetching price data…',
  'Analyzing technicals…',
  'Checking options flow…',
  'Reviewing fundamentals…',
  'Synthesizing research…',
]

function markdownToHtml(md) {
  if (!md) return ''
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n/g, '<p></p>')
    .replace(/\n/g, '<br>')
}

export default function DeepResearch() {
  const ticker = useStore(s => s.ticker)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState(null)
  const [noApiKey, setNoApiKey] = useState(false)
  const stepTimerRef = useRef(null)

  // Clear results when ticker changes
  useEffect(() => {
    setResult(null)
    setError(null)
  }, [ticker])

  // Cycle through loading step labels while waiting
  useEffect(() => {
    if (loading) {
      setLoadingStep(0)
      stepTimerRef.current = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % LOADING_STEPS.length)
      }, 2000)
    } else {
      clearInterval(stepTimerRef.current)
    }
    return () => clearInterval(stepTimerRef.current)
  }, [loading])

  async function runResearch() {
    const q = question.trim() || 'What is the overall outlook for this stock?'
    setLoading(true)
    setError(null)
    setNoApiKey(false)
    setResult(null)
    try {
      const data = await api.post('/ai_agent/research', { ticker, question: q })
      if (data.error && data.error.includes('No AI provider')) {
        setNoApiKey(true)
      } else if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      runResearch()
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
    <div className="pad ai-research-root">
      {/* Header */}
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">🔬 Deep Research — {ticker}</h2>
          <p className="ai-section-sub">
            Groq AI uses real-time tools to research your question in depth
          </p>
        </div>
      </div>

      {/* Question input */}
      <div className="ai-research-input-card">
        <label className="ai-input-label">Research Question</label>
        <textarea
          className="ai-textarea"
          rows={3}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Is this stock overvalued at current prices?"
          disabled={loading}
        />
        <div className="ai-input-meta">
          Press Ctrl+Enter to submit
        </div>

        {/* Example question chips */}
        <div className="ai-chips-label">Example questions:</div>
        <div className="ai-chips">
          {EXAMPLE_QUESTIONS.map(q => (
            <button
              key={q}
              className="ai-chip"
              onClick={() => setQuestion(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>

        <button
          className="btn-primary ai-run-btn"
          onClick={runResearch}
          disabled={loading}
        >
          {loading ? 'Researching…' : '🔬 Run Research'}
        </button>
      </div>

      {/* Loading state with step indicators */}
      {loading && (
        <div className="ai-loading-card">
          <div className="ai-loading-icon">🤖</div>
          <div className="ai-loading-text">
            {LOADING_STEPS[loadingStep]}
          </div>
          <div className="ai-step-track">
            {LOADING_STEPS.map((step, i) => (
              <div
                key={i}
                className={`ai-step-dot ${i <= loadingStep ? 'active' : ''}`}
              />
            ))}
          </div>
          <div className="ai-loading-sub">
            Groq is calling market data tools and synthesizing findings…
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="error-box">
          ⚠ {error}
        </div>
      )}

      {/* Result */}
      {!loading && result && (
        <div className="ai-result-card">
          <div className="ai-result-header">
            <span className="ai-result-label">Research Report — {result.ticker}</span>
            <span className="ai-result-timestamp">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
          {result.question && (
            <div className="ai-research-question-badge">
              ❓ {result.question}
            </div>
          )}
          <div
            className="ai-result-body ai-research-body"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(result.research) }}
          />
          <div className="ai-result-footer">
            Powered by Groq · Llama 3.3 70B · Real-time market data · Not financial advice
          </div>
        </div>
      )}
    </div>
  )
}
