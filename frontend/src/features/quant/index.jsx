import { useState, useEffect } from 'react'
import { api } from '../../core/api'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v, d = 1) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(d) : v
}

function pctColor(v) {
  if (v == null) return 'var(--muted)'
  return v > 0 ? 'var(--bull)' : v < 0 ? 'var(--bear)' : 'var(--muted)'
}

const CATEGORY_COLOR = {
  regime:     '#a78bfa',
  momentum:   '#38bdf8',
  reversion:  '#fbbf24',
  factor:     '#4ade80',
  volatility: '#f87171',
}

const DIRECTION_LABEL = { 1: '▲ Bullish', '-1': '▼ Bearish', 0: '◆ Neutral' }
const DIRECTION_COLOR = { 1: 'var(--bull)', '-1': 'var(--bear)', 0: 'var(--muted)' }

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfBar({ pct, color }) {
  const c = color || (pct >= 65 ? 'var(--bull)' : pct >= 45 ? 'var(--accent)' : 'var(--bear)')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: c, borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: c, minWidth: 38, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── Regime mini-chart ─────────────────────────────────────────────────────────

function RegimeChart({ chartData }) {
  const regimeSeries = chartData?.regime_series ?? []
  const priceSeries  = chartData?.price_series  ?? []
  if (!regimeSeries.length) return null

  const last = regimeSeries.slice(-120)   // show last ~6 months
  const W = 560, H = 60

  // Map Bull=1, Bear=-1 to y positions
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Regime history (last 6 months)</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}>
        {last.map((d, i) => {
          const x = (i / last.length) * W
          const w = W / last.length + 1
          const isBull = d.value === 1
          return (
            <rect key={i} x={x} y={0} width={w} height={H}
              fill={isBull ? '#4ade8022' : '#f8717122'} />
          )
        })}
        {/* Regime boundary line */}
        {last.map((d, i) => {
          if (i === 0) return null
          const prev = last[i - 1]
          if (prev.value === d.value) return null
          const x = (i / last.length) * W
          return <line key={`l${i}`} x1={x} y1={0} x2={x} y2={H} stroke="var(--border)" strokeWidth={1} strokeDasharray="2,2" />
        })}
        {/* Bull / Bear labels at end */}
        {(() => {
          const last1 = last[last.length - 1]
          const color = last1?.value === 1 ? '#4ade80' : '#f87171'
          const label = last1?.value === 1 ? 'BULL' : 'BEAR'
          return <text x={W - 4} y={H / 2 + 4} fontSize={9} fill={color} textAnchor="end" fontWeight="700">{label}</text>
        })()}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: '#4ade80' }}>■ Bull regime</span>
        <span style={{ color: '#f87171' }}>■ Bear regime</span>
      </div>
    </div>
  )
}

// ── Transition matrix ─────────────────────────────────────────────────────────

function TransitionMatrix({ matrix }) {
  if (!matrix) return null
  const cells = [
    { label: 'Bull→Bull', value: matrix['Bull→Bull'], color: '#4ade80' },
    { label: 'Bull→Bear', value: matrix['Bull→Bear'], color: '#f87171' },
    { label: 'Bear→Bull', value: matrix['Bear→Bull'], color: '#4ade80' },
    { label: 'Bear→Bear', value: matrix['Bear→Bear'], color: '#f87171' },
  ]
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Transition probabilities</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {cells.map(c => (
          <div key={c.label} style={{
            background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.value > 70 ? c.color : 'var(--text)' }}>
              {c.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Result Card ───────────────────────────────────────────────────────────────

function ResultCard({ result }) {
  const [expanded, setExpanded] = useState(true)

  if (result.error) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--bear)', borderRadius: 12, padding: 20,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--bear)', marginBottom: 6 }}>{result.model_name}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Error: {result.error}</div>
      </div>
    )
  }

  const catColor  = CATEGORY_COLOR[result.model_id?.split('_')[0]] || 'var(--accent)'
  const dirColor  = DIRECTION_COLOR[String(result.direction)] || 'var(--muted)'
  const dirLabel  = DIRECTION_LABEL[String(result.direction)] || '—'

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${catColor}44`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          background: `${catColor}08`,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: catColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>
            {result.model_name}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: dirColor }}>{dirLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Confidence</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: catColor }}>{result.confidence}%</div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 16, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {/* Regime label */}
          <div style={{
            display: 'inline-block', padding: '4px 10px', borderRadius: 20,
            background: result.direction === 1 ? '#4ade8020' : result.direction === -1 ? '#f8717120' : 'var(--surface2)',
            color: dirColor, fontSize: 12, fontWeight: 700, marginBottom: 14,
          }}>
            {result.regime}
          </div>

          {/* Confidence bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Confidence</div>
            <ConfBar pct={result.confidence} color={catColor} />
          </div>

          {/* Summary */}
          <div style={{
            padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8,
            fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16,
          }}>
            {result.summary}
          </div>

          {/* Signals */}
          {result.signals?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Supporting Evidence
              </div>
              {result.signals.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, padding: '6px 0',
                  borderBottom: i < result.signals.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 13, color: 'var(--text)',
                }}>
                  <span style={{ color: catColor, flexShrink: 0 }}>›</span>
                  {s}
                </div>
              ))}
            </div>
          )}

          {/* Regime chart */}
          {result.chart_data && <RegimeChart chartData={result.chart_data} />}

          {/* Model-specific extras */}
          {result.meta?.transition_matrix && (
            <TransitionMatrix matrix={result.meta.transition_matrix} />
          )}

          {/* Annual return stats */}
          {result.meta?.bull_state_annual_return != null && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, background: '#4ade8012', border: '1px solid #4ade8030', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Bull regime avg return</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bull)' }}>
                  {result.meta.bull_state_annual_return > 0 ? '+' : ''}{fmt(result.meta.bull_state_annual_return)}% p.a.
                </div>
              </div>
              <div style={{ flex: 1, background: '#f8717112', border: '1px solid #f8717130', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Bear regime avg return</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bear)' }}>
                  {fmt(result.meta.bear_state_annual_return)}% p.a.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Model selector card ───────────────────────────────────────────────────────

function ModelCard({ model, selected, onToggle }) {
  const color = CATEGORY_COLOR[model.category] || 'var(--accent)'
  return (
    <div
      onClick={onToggle}
      style={{
        padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${selected ? color : 'var(--border)'}`,
        background: selected ? `${color}12` : 'var(--surface)',
        transition: 'all .15s', userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: selected ? color : 'var(--surface2)',
          border: `2px solid ${color}`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: selected ? color : 'var(--text)' }}>
          {model.name}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 10,
          background: `${color}22`, color,
        }}>
          {model.category}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 18 }}>{model.description}</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function QuantWorkbench() {
  const [ticker, setTicker]         = useState('')
  const [inputVal, setInputVal]     = useState('')
  const [models, setModels]         = useState([])
  const [selected, setSelected]     = useState([])
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  // Load available models on mount
  useEffect(() => {
    api.get('/quant/models')
      .then(r => {
        setModels(r.models || [])
        // Default: select all
        setSelected((r.models || []).map(m => m.id))
      })
      .catch(() => {})
  }, [])

  const toggleModel = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const run = async () => {
    const t = inputVal.trim().toUpperCase()
    if (!t || !selected.length) return
    setTicker(t)
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const r = await api.get(`/quant/analyze/${t}?models=${selected.join(',')}`)
      setResults(r.results || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => { if (e.key === 'Enter') run() }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧮 Quant Model Workbench</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Apply institutional-grade quantitative models to any stock and compare their signals
        </p>
      </div>

      {/* Stock input */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="Enter ticker — e.g. NVDA"
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, fontSize: 15, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', outline: 'none', letterSpacing: '.5px',
          }}
        />
        <button
          onClick={run}
          disabled={loading || !inputVal.trim() || !selected.length}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: loading ? 'var(--muted)' : '#000',
            fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '⏳ Running…' : '▶ Analyze'}
        </button>
      </div>

      {/* Model selector */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          Select Models
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
            ({selected.length}/{models.length} selected)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {models.map(m => (
            <ModelCard
              key={m.id}
              model={m}
              selected={selected.includes(m.id)}
              onToggle={() => toggleModel(m.id)}
            />
          ))}
          {!models.length && (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading models…</div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 14, background: '#f8717115', border: '1px solid var(--bear)', borderRadius: 8, fontSize: 13, color: 'var(--bear)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          ⏳ Running {selected.length} model{selected.length > 1 ? 's' : ''} on {inputVal.trim().toUpperCase()}… (~10-30s)
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 16 }}>
            Results for <span style={{ color: 'var(--accent)' }}>{ticker}</span>
          </div>

          {/* Summary bar when multiple models */}
          {results.length > 1 && (() => {
            const valid = results.filter(r => !r.error && r.direction != null)
            const bull  = valid.filter(r => r.direction === 1).length
            const bear  = valid.filter(r => r.direction === -1).length
            const neutral = valid.filter(r => r.direction === 0).length
            const consensus = bull > bear ? '▲ Bullish' : bear > bull ? '▼ Bearish' : '◆ Mixed'
            const consColor = bull > bear ? 'var(--bull)' : bear > bull ? 'var(--bear)' : 'var(--muted)'
            return (
              <div style={{
                padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Model Consensus</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: consColor }}>{consensus}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginLeft: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--bull)' }}>{bull}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bullish</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--bear)' }}>{bear}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bearish</div>
                  </div>
                  {neutral > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--muted)' }}>{neutral}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Neutral</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {results.map((r, i) => <ResultCard key={i} result={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}
