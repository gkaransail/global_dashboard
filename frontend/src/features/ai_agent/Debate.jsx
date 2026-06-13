import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'
import SetupCard from './SetupCard'

function ThinkingDots() {
  return (
    <span className="thinking-dots">
      <span>.</span><span>.</span><span>.</span>
    </span>
  )
}

function ConvictionMeter({ value }) {
  const color = value >= 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#ef4444'
  const label = value >= 80 ? 'High Conviction' : value >= 60 ? 'Good Conviction' : value >= 40 ? 'Mixed Signals' : 'High Uncertainty'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Conviction Score</span>
        <span style={{ fontWeight: 700, color, fontSize: 15 }}>{value} / 100 — {label}</span>
      </div>
      <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function ArgumentCard({ side, icon, color, text }) {
  return (
    <div style={{
      flex: 1, background: '#0f172a', border: `1px solid ${color}33`,
      borderRadius: 10, padding: '16px 18px', minWidth: 0,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10, letterSpacing: 1 }}>
        {icon} {side} CASE
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.65, color: '#cbd5e1', margin: 0, fontFamily: 'inherit' }}>
        {text}
      </pre>
    </div>
  )
}

export default function Debate() {
  const ticker = useStore(s => s.ticker)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noApiKey, setNoApiKey] = useState(false)
  const prevTickerRef = useRef(null)

  useEffect(() => {
    if (prevTickerRef.current !== ticker) {
      prevTickerRef.current = ticker
      setResult(null)
      setError(null)
      setNoApiKey(false)
    }
  }, [ticker])

  async function runDebate() {
    setLoading(true)
    setError(null)
    setResult(null)
    setNoApiKey(false)
    try {
      const data = await api.post('/ai_agent/debate', { ticker })
      if (data.error === 'ANTHROPIC_API_KEY not configured') {
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

  if (noApiKey) return <div className="pad"><SetupCard /></div>

  return (
    <div className="pad" style={{ maxWidth: 1200 }}>
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">⚔ Bull vs Bear Debate — {ticker}</h2>
          <p className="ai-section-sub">
            Two AI analysts argue opposite sides. The judge scores conviction — high disagreement = smaller position size.
          </p>
        </div>
        <button className="btn-secondary" onClick={runDebate} disabled={loading}>
          {loading ? 'Debating…' : result ? '↺ Re-run Debate' : '▶ Start Debate'}
        </button>
      </div>

      {loading && (
        <div className="ai-loading-card">
          <div className="ai-loading-icon">⚔</div>
          <div className="ai-loading-text">Bull &amp; Bear agents debating {ticker}<ThinkingDots /></div>
          <div className="ai-loading-sub">Gathering data → Bull case → Bear case → Judge verdict (~30s)</div>
        </div>
      )}

      {!loading && error && (
        <div className="error-box">
          <span>⚠ {error}</span>
          <button className="btn-secondary" style={{ marginLeft: 12 }} onClick={runDebate}>Retry</button>
        </div>
      )}

      {!loading && result && (
        <>
          {/* Verdict banner */}
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 10,
            padding: '16px 20px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>FINAL VERDICT</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{result.final_verdict}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>POSITION SIZING</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>{result.sizing_guidance}</div>
              </div>
            </div>
            <ConvictionMeter value={result.conviction} />
          </div>

          {/* Bull vs Bear columns */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <ArgumentCard side="BULL" icon="📈" color="#22c55e" text={result.bull_argument} />
            <ArgumentCard side="BEAR" icon="📉" color="#ef4444" text={result.bear_argument} />
          </div>

          {/* Judge verdict */}
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 10, letterSpacing: 1 }}>
              ⚖ JUDGE VERDICT
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.65, color: '#cbd5e1', margin: 0, fontFamily: 'inherit' }}>
              {result.judge_verdict}
            </pre>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: '#475569', textAlign: 'center' }}>
            Powered by Claude · Not financial advice · Data via yfinance
          </div>
        </>
      )}

      {!loading && !result && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>Bull vs Bear debate for {ticker}</div>
          <div style={{ fontSize: 13 }}>Press "Start Debate" — three Claude agents will argue, rebut, and score conviction.</div>
        </div>
      )}
    </div>
  )
}
