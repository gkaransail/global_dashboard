import { useState } from 'react'
import { api } from '../../core/api'

const EXAMPLES = [
  'Revenue grew 28% YoY, beating analyst estimates. Management raised full-year guidance.',
  'The company faces mounting debt obligations and slowing user growth amid competitive pressure.',
  'Mixed results: EPS beat by $0.03 but revenue missed slightly. Guidance in-line with consensus.',
]

function ScoreGauge({ label, value, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{(value * 100).toFixed(1)}%</div>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{label}</div>
      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${value * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

export default function TextAnalyzer() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function analyze(inputText) {
    const t = inputText ?? text
    if (!t.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.post('/sentiment_ai/analyze', { text: t })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const compoundColor = result
    ? result.compound > 0.05 ? '#22c55e' : result.compound < -0.05 ? '#ef4444' : '#94a3b8'
    : '#94a3b8'

  return (
    <div className="pad" style={{ maxWidth: 760 }}>
      <h2 className="ai-section-title">🧬 FinBERT Text Analyzer</h2>
      <p className="ai-section-sub" style={{ marginBottom: 16 }}>
        Paste any financial text — earnings excerpts, analyst notes, news — and score its sentiment.
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste earnings call text, analyst commentary, or any financial sentence here…"
        style={{
          width: '100%', minHeight: 110, background: '#0f172a', border: '1px solid #334155',
          borderRadius: 8, color: '#e2e8f0', padding: '12px 14px', fontSize: 13,
          lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => analyze()} disabled={loading || !text.trim()}>
          {loading ? 'Analyzing…' : 'Analyze Sentiment'}
        </button>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            className="btn-secondary"
            style={{ fontSize: 11 }}
            onClick={() => { setText(ex); analyze(ex) }}
          >
            Example {i + 1}
          </button>
        ))}
      </div>

      {error && <div className="error-box" style={{ marginTop: 12 }}>⚠ {error}</div>}

      {result && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '20px 24px', marginTop: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>DOMINANT SENTIMENT</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: compoundColor, textTransform: 'uppercase' }}>
              {result.label}
            </div>
            <div style={{ fontSize: 14, color: compoundColor, marginTop: 4 }}>
              Compound score: {result.compound > 0 ? '+' : ''}{result.compound.toFixed(4)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <ScoreGauge label="positive" value={result.positive} color="#22c55e" />
            <ScoreGauge label="neutral"  value={result.neutral}  color="#94a3b8" />
            <ScoreGauge label="negative" value={result.negative} color="#ef4444" />
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: '#475569', borderTop: '1px solid #1e293b', paddingTop: 12 }}>
            Input: "{text.slice(0, 120)}{text.length > 120 ? '…' : ''}"
          </div>
        </div>
      )}
    </div>
  )
}
