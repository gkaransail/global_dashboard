import { useState, useEffect } from 'react'
import { useStore, lookbackForTimeframe } from '../../core/store'
import { api } from '../../core/api'

const DIR_COLOR  = { bullish_reversal: 'var(--bull)', bearish_reversal: 'var(--bear)', neutral: 'var(--neutral)' }
const DIR_ICON   = { bullish_reversal: '🟢', bearish_reversal: '🔴', neutral: '⚪' }
const DIR_LABEL  = { bullish_reversal: 'BULLISH REVERSAL', bearish_reversal: 'BEARISH REVERSAL', neutral: 'NEUTRAL' }
const CAT_WEIGHT = { macro: '30%', technical: '35%', breadth: '20%', sentiment: '15%' }

function retClass(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat' }

function markdownToHtml(md) {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^<]*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n/g, '<p></p>').replace(/\n/g, '<br>')
}

export default function ReversalDashboard() {
  const { ticker, timeframe } = useStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [explain, setExplain] = useState(false)

  useEffect(() => { fetchData() }, [ticker, timeframe, explain])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const days = lookbackForTimeframe(timeframe)
      const d = await api.get(`/reversal/analyze/${ticker}?explain=${explain}&lookback_days=${days}`)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /><span>Analyzing {ticker}...</span></div>
  if (error)   return <div className="pad"><div className="error-box">⚠ {error}</div></div>
  if (!data)   return null

  const color = DIR_COLOR[data.direction]
  const confPct = Math.round(data.confidence * 100)
  const breakdown = data.methodology_breakdown || {}
  const sorted = [...(data.signals || [])].sort((a, b) => b.strength - a.strength)

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Explain toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={explain} onChange={e => setExplain(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
          Explain why
        </label>
      </div>

      {/* Verdict card */}
      <div className="card">
        <div className="verdict-card">
          <div className="verdict-icon">{DIR_ICON[data.direction]}</div>
          <div className="verdict-info">
            <div className="verdict-title" style={{ color }}>{data.ticker} — {DIR_LABEL[data.direction]}</div>
            <div className="verdict-sub">
              {data.signal_counts.bullish}B / {data.signal_counts.bearish}B / {data.signal_counts.total} total signals · {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <div className="verdict-meta">
            <div className="conf-wrap">
              <div className="conf-track"><div className="conf-fill" style={{ width: confPct + '%', background: color }} /></div>
              <div className="conf-label" style={{ color }}>{confPct}%</div>
            </div>
            <span className={`badge badge-${data.strength}`}>{data.strength}</span>
          </div>
        </div>
      </div>

      {/* Methodology breakdown */}
      <div>
        <div className="section-title">Methodology Breakdown</div>
        <div className="card-grid-4">
          {Object.entries(breakdown).map(([cat, info]) => {
            const sc = info.score ?? 0
            const barColor = sc > 0.05 ? 'var(--bull)' : sc < -0.05 ? 'var(--bear)' : 'var(--neutral)'
            const dir = sc > 0.05 ? '↑ Bullish' : sc < -0.05 ? '↓ Bearish' : '→ Neutral'
            return (
              <div key={cat} className="card card-sm">
                <div className="breakdown-cat"><span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span><span>{CAT_WEIGHT[cat]}</span></div>
                <div className="breakdown-score" style={{ color: barColor }}>{sc >= 0 ? '+' : ''}{(sc * 100).toFixed(1)}%</div>
                <div className="breakdown-sub">{dir} · {info.signal_count} signal{info.signal_count !== 1 ? 's' : ''}</div>
                <div className="score-track"><div className="score-fill" style={{ width: Math.abs(sc) * 100 + '%', background: barColor }} /></div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Signals */}
      <div>
        <div className="section-title">All Signals Detected ({sorted.length})</div>
        <div className="signals-panel">
          {sorted.length === 0 && (
            <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>No signals detected.</div>
          )}
          {sorted.map((s, i) => {
            const c = DIR_COLOR[s.direction]
            return (
              <div key={i} className="signal-row">
                <div className="signal-dot" style={{ background: c }} />
                <div>
                  <div className="signal-name">{s.name}</div>
                  <span className="signal-cat">{s.category}</span>
                  <div className="signal-expl">{s.explanation}</div>
                </div>
                <div className="signal-strength" style={{ color: c }}>{Math.round(s.strength * 100)}%</div>
                <div className="signal-value">{s.value != null ? s.value : ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Explanation */}
      {data.explanation && (
        <div className="explanation-box" dangerouslySetInnerHTML={{ __html: markdownToHtml(data.explanation) }} />
      )}
    </div>
  )
}
