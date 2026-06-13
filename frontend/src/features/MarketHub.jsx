import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../core/api'
import { useStore } from '../core/store'

// ── Constants ────────────────────────────────────────────────────────────────

const HORIZONS = [
  { key: '1w', label: '1 Week',  desc: 'Options (50%) · Reversal (25%) · Smart Money (15%) · Insider (10%)' },
  { key: '1m', label: '1 Month', desc: 'Options (40%) · Reversal (30%) · Smart Money (20%) · Insider (10%)' },
  { key: '3m', label: '3 Months',desc: 'Options (25%) · Reversal (35%) · Smart Money (25%) · Insider (15%)' },
]

const WEIGHT_COLORS = {
  options:     '#818cf8',
  reversal:    '#22d37a',
  smart_money: '#f59e0b',
  insider:     '#38bdf8',
}

const VERDICT_THEME = {
  'Strong Buy':  { bg: '#052e16', border: '#16a34a', text: '#4ade80', dot: '#22c55e' },
  'Bullish':     { bg: '#0a1f0e', border: '#15803d', text: '#86efac', dot: '#4ade80' },
  'Neutral':     { bg: '#0f172a', border: '#334155', text: '#94a3b8', dot: '#64748b' },
  'Bearish':     { bg: '#1f0a0a', border: '#b91c1c', text: '#fca5a5', dot: '#f87171' },
  'Strong Sell': { bg: '#2d0505', border: '#dc2626', text: '#fca5a5', dot: '#ef4444' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MarketTicker({ data }) {
  if (!data) return null
  const isVix = data.symbol === '^VIX'
  const isUp = isVix ? data.change_pct < 0 : data.change_pct >= 0
  const changeColor = isUp ? 'var(--bull)' : 'var(--bear)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px', borderRight: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14 }}>{data.icon}</span>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1 }}>{data.label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
            {data.price != null ? data.price.toLocaleString() : '—'}
          </span>
          <span style={{ fontSize: 11, color: changeColor, fontWeight: 600 }}>
            {data.change_pct >= 0 ? '+' : ''}{data.change_pct}%
          </span>
        </div>
      </div>
    </div>
  )
}

function SignalBar({ label, score, color, weight, detail }) {
  const pct = Math.abs(score) * 100
  const isPos = score >= 0
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3 }}>
            {Math.round(weight * 100)}%
          </span>
        </div>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>
          {isPos ? '+' : ''}{(score * 100).toFixed(0)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border-hi)' }} />
        <div style={{
          position: 'absolute',
          left: isPos ? '50%' : `${50 - pct / 2}%`,
          width: `${pct / 2}%`,
          height: '100%', borderRadius: 3,
          background: color, opacity: 0.85,
        }} />
      </div>
      {detail && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{detail}</div>}
    </div>
  )
}

function CompositeArc({ score }) {
  // score: -1 to +1 → mapped to 0–180° arc
  const pct = (score + 1) / 2  // 0 to 1
  const angle = pct * 180      // 0 to 180 degrees
  const rad = (angle - 90) * (Math.PI / 180)
  const R = 44
  const cx = 55, cy = 55
  const nx = cx + R * Math.cos(rad)
  const ny = cy + R * Math.sin(rad)

  const gradId = `arc-grad-${Math.round(score * 100)}`
  const fgColor = score > 0.15 ? '#22d37a' : score < -0.15 ? '#f05252' : '#94a3b8'

  return (
    <svg width={110} height={65} viewBox="0 0 110 65">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f05252" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#22d37a" />
        </linearGradient>
      </defs>
      {/* Track */}
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none" stroke="#1e293b" strokeWidth={8} strokeLinecap="round"
      />
      {/* Filled arc */}
      {pct > 0 && (
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 ${pct > 0.5 ? 1 : 0} 1 ${nx} ${ny}`}
          fill="none" stroke={fgColor} strokeWidth={8} strokeLinecap="round"
          opacity={0.9}
        />
      )}
      {/* Needle dot */}
      <circle cx={nx} cy={ny} r={4} fill="var(--text)" />
    </svg>
  )
}

function StockCard({ stock, weights, onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const setTicker = useStore(s => s.setTicker)

  const theme = VERDICT_THEME[stock.verdict] || VERDICT_THEME['Neutral']
  const sig = stock.signals

  function handleOpen(path) {
    setTicker(stock.ticker)
    navigate(path)
  }

  const displayScore = stock.display_score
  const scoreColor = displayScore >= 65 ? '#22d37a' : displayScore <= 35 ? '#f05252' : '#94a3b8'

  return (
    <div style={{
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'box-shadow 0.15s',
    }}>
      {/* Card header */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Score arc */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <CompositeArc score={stock.composite_score} />
            <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor, marginTop: -10, lineHeight: 1 }}>
              {displayScore}
            </div>
            <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>score</div>
          </div>

          {/* Ticker + verdict */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace' }}>
                {stock.ticker}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                background: theme.bg, border: `1px solid ${theme.border}`,
                color: theme.text, whiteSpace: 'nowrap',
              }}>
                {stock.verdict}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                ${stock.price?.toLocaleString()}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: stock.change_pct >= 0 ? '#22d37a' : '#f05252',
              }}>
                {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
              </span>
            </div>

            {/* Top signal summary line */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <SignalPill
                  label="⛓ Options"
                  score={sig.options.score}
                  color={WEIGHT_COLORS.options}
                />
                <SignalPill
                  label="🔄 Reversal"
                  score={sig.reversal.score}
                  color={WEIGHT_COLORS.reversal}
                />
                <SignalPill
                  label="💰 Smart$"
                  score={sig.smart_money.score}
                  color={WEIGHT_COLORS.smart_money}
                />
                <SignalPill
                  label="👁 Insider"
                  score={sig.insider.score}
                  color={WEIGHT_COLORS.insider}
                />
              </div>
            </div>
          </div>

          <div style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0, marginTop: 4 }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.border}30`, padding: '14px 16px' }}>
          {/* Options signal — highlighted since highest weight */}
          <div style={{
            background: '#0f172a', borderRadius: 8, padding: '10px 12px', marginBottom: 10,
            border: `1px solid ${WEIGHT_COLORS.options}30`,
          }}>
            <div style={{ fontSize: 11, color: WEIGHT_COLORS.options, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ⛓ Options Flow ({Math.round(weights.options * 100)}% weight)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11, color: 'var(--text-dim)' }}>
              {sig.options.pcr != null && (
                <div>PCR <span style={{ color: 'var(--text)', fontWeight: 600 }}>{sig.options.pcr}</span>
                  {sig.options.pcr < 0.7 ? ' 🟢' : sig.options.pcr > 1.2 ? ' 🔴' : ' 🟡'}
                </div>
              )}
              {sig.options.call_volume > 0 && (
                <div>Call vol <span style={{ color: '#4ade80', fontWeight: 600 }}>{(sig.options.call_volume / 1000).toFixed(0)}K</span></div>
              )}
              {sig.options.put_volume > 0 && (
                <div>Put vol <span style={{ color: '#f87171', fontWeight: 600 }}>{(sig.options.put_volume / 1000).toFixed(0)}K</span></div>
              )}
              {sig.options.unusual_calls > 0 && (
                <div>Unusual calls <span style={{ color: '#4ade80', fontWeight: 600 }}>{sig.options.unusual_calls} strikes</span></div>
              )}
              {sig.options.unusual_puts > 0 && (
                <div>Unusual puts <span style={{ color: '#f87171', fontWeight: 600 }}>{sig.options.unusual_puts} strikes</span></div>
              )}
              {sig.options.iv_skew != null && (
                <div>IV skew <span style={{ color: sig.options.iv_skew > 0.05 ? '#f87171' : '#4ade80', fontWeight: 600 }}>
                  {sig.options.iv_skew > 0 ? '+' : ''}{(sig.options.iv_skew * 100).toFixed(1)}%
                </span></div>
              )}
            </div>
          </div>

          {/* Other signals */}
          <SignalBar
            label="Reversal Signals"
            score={sig.reversal.score}
            color={WEIGHT_COLORS.reversal}
            weight={weights.reversal}
            detail={sig.reversal.label}
          />
          <SignalBar
            label="Smart Money"
            score={sig.smart_money.score}
            color={WEIGHT_COLORS.smart_money}
            weight={weights.smart_money}
            detail={sig.smart_money.label}
          />
          <SignalBar
            label="Insider Activity"
            score={sig.insider.score}
            color={WEIGHT_COLORS.insider}
            weight={weights.insider}
            detail={sig.insider.label}
          />

          {/* Top reasons */}
          {stock.top_reasons?.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Key signals</div>
              {stock.top_reasons.slice(0, 3).map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
                  · {r}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button
              onClick={() => handleOpen('/options/overview')}
              style={btnStyle('#818cf8')}
            >
              ⛓ Options Chain
            </button>
            <button
              onClick={() => handleOpen('/reversal/analyze')}
              style={btnStyle('#22d37a')}
            >
              🔄 Reversal
            </button>
            <button
              onClick={() => handleOpen('/technical/indicators')}
              style={btnStyle('#60a5fa')}
            >
              📊 Technical
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SignalPill({ label, score, color }) {
  const dir = score > 0.1 ? '▲' : score < -0.1 ? '▼' : '—'
  const textColor = score > 0.1 ? '#22d37a' : score < -0.1 ? '#f05252' : '#94a3b8'
  return (
    <div style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}40`,
      color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 3,
    }}>
      {label} <span style={{ color: textColor, fontWeight: 700 }}>{dir}</span>
    </div>
  )
}

function btnStyle(color) {
  return {
    flex: 1, padding: '6px 4px', fontSize: 10, borderRadius: 6, cursor: 'pointer',
    background: `${color}18`, border: `1px solid ${color}40`,
    color, fontWeight: 600, textAlign: 'center',
  }
}

function WeightLegend({ weights }) {
  const entries = [
    { key: 'options',     label: 'Options Flow' },
    { key: 'reversal',    label: 'Reversal' },
    { key: 'smart_money', label: 'Smart Money' },
    { key: 'insider',     label: 'Insider' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(e => (
        <div key={e.key} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20, fontSize: 11,
          background: `${WEIGHT_COLORS[e.key]}18`,
          border: `1px solid ${WEIGHT_COLORS[e.key]}40`,
          color: WEIGHT_COLORS[e.key], fontWeight: 600,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 2, background: WEIGHT_COLORS[e.key] }} />
          {e.label} {Math.round((weights?.[e.key] || 0) * 100)}%
        </div>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16, animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 80, height: 65, borderRadius: 8, background: 'var(--surface2)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 20, width: '40%', background: 'var(--surface2)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 14, width: '60%', background: 'var(--surface2)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 10, width: '80%', background: 'var(--surface2)', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketHub() {
  const [horizon, setHorizon] = useState('1m')
  const [scanData, setScanData] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [tab, setTab] = useState('bullish') // 'bullish' | 'bearish'

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.get('/market_intel/overview')
      setOverview(data)
    } catch {
      // non-critical
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadScan = useCallback(async (h) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get(`/market_intel/scan?horizon=${h}`)
      setScanData(data)
      setLastUpdated(new Date(data.last_updated))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => { loadScan(horizon) }, [horizon, loadScan])

  const weights = scanData?.weights || HORIZONS.find(h => h.key === horizon)?.weights || {}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Market ticker bar ───────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch', overflowX: 'auto',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {overviewLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ padding: '10px 16px', borderRight: '1px solid var(--border)', minWidth: 100, opacity: 0.3 }}>
                <div style={{ height: 10, width: 40, background: 'var(--surface2)', borderRadius: 3, marginBottom: 6 }} />
                <div style={{ height: 14, width: 60, background: 'var(--surface2)', borderRadius: 3 }} />
              </div>
            ))
          : overview?.tickers?.map(t => <MarketTicker key={t.symbol} data={t} />)
        }
        <div style={{ marginLeft: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d37a', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>Live</span>
        </div>
      </div>

      {/* ── Page body ───────────────────────────────────────────── */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                🎯 Market Intelligence Hub
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 5 }}>
                Options-weighted multi-factor ranking · {scanData ? `${scanData.scanned} stocks scanned` : '70+ stocks'}
                {lastUpdated && (
                  <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => loadScan(horizon)}
              disabled={loading}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-dim)', fontSize: 12, opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '⟳ Scanning…' : '⟳ Refresh'}
            </button>
          </div>

          {/* Weight legend */}
          <div style={{ marginTop: 12 }}>
            <WeightLegend weights={scanData?.weights} />
          </div>
        </div>

        {/* ── Time horizon selector ───────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 24,
          background: 'var(--surface)', padding: 6, borderRadius: 12,
          border: '1px solid var(--border)', width: 'fit-content',
        }}>
          {HORIZONS.map(h => (
            <button
              key={h.key}
              onClick={() => setHorizon(h.key)}
              style={{
                padding: '10px 24px', borderRadius: 8, cursor: 'pointer', border: 'none',
                background: horizon === h.key ? 'var(--accent)' : 'transparent',
                color: horizon === h.key ? '#fff' : 'var(--text-dim)',
                fontWeight: horizon === h.key ? 700 : 400,
                fontSize: 13, transition: 'all 0.15s',
              }}
            >
              {h.label}
            </button>
          ))}
        </div>

        {/* Horizon descriptor */}
        <div style={{ marginBottom: 20, fontSize: 12, color: 'var(--muted)' }}>
          {HORIZONS.find(h => h.key === horizon)?.desc}
        </div>

        {/* ── Error ──────────────────────────────────────────────── */}
        {error && (
          <div style={{
            padding: 20, borderRadius: 10, background: '#2d0505',
            border: '1px solid #dc2626', color: '#fca5a5', marginBottom: 20,
          }}>
            ⚠️ {error} —{' '}
            <button onClick={() => loadScan(horizon)} style={{ color: '#fca5a5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              retry
            </button>
          </div>
        )}

        {/* ── Bull / Bear tab toggle (mobile) ────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          <button
            onClick={() => setTab('bullish')}
            style={{
              padding: '7px 18px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid', borderColor: tab === 'bullish' ? '#16a34a' : 'var(--border)',
              background: tab === 'bullish' ? '#052e16' : 'transparent',
              color: tab === 'bullish' ? '#4ade80' : 'var(--text-dim)',
              fontSize: 13, fontWeight: tab === 'bullish' ? 700 : 400,
            }}
          >
            🟢 Bullish Picks {scanData && `(${scanData.bullish.length})`}
          </button>
          <button
            onClick={() => setTab('bearish')}
            style={{
              padding: '7px 18px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid', borderColor: tab === 'bearish' ? '#b91c1c' : 'var(--border)',
              background: tab === 'bearish' ? '#2d0505' : 'transparent',
              color: tab === 'bearish' ? '#fca5a5' : 'var(--text-dim)',
              fontSize: 13, fontWeight: tab === 'bearish' ? 700 : 400,
            }}
          >
            🔴 Bearish Picks {scanData && `(${scanData.bearish.length})`}
          </button>
        </div>

        {/* ── Two-column stock grid ───────────────────────────────── */}
        <style>{`
          .hub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .hub-col-bull { display: block !important; }
          .hub-col-bear { display: block !important; }
          @media (max-width: 900px) {
            .hub-grid { grid-template-columns: 1fr; }
            .hub-col-bull { display: ${tab === 'bearish' ? 'none' : 'block'} !important; }
            .hub-col-bear { display: ${tab === 'bullish' ? 'none' : 'block'} !important; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>

        <div className="hub-grid">

          {/* Bullish column */}
          <div className="hub-col-bull">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              paddingBottom: 10, borderBottom: '1px solid #16a34a40',
            }}>
              <span style={{ fontSize: 13 }}>🟢</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>Top Bullish Picks</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                Highest probability upside in {HORIZONS.find(h => h.key === horizon)?.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
                : scanData?.bullish?.length > 0
                  ? scanData.bullish.map(s => (
                      <StockCard key={s.ticker} stock={s} weights={scanData.weights} />
                    ))
                  : <EmptyState side="bullish" />
              }
            </div>
          </div>

          {/* Bearish column */}
          <div className="hub-col-bear">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              paddingBottom: 10, borderBottom: '1px solid #b91c1c40',
            }}>
              <span style={{ fontSize: 13 }}>🔴</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5' }}>Top Bearish Picks</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                Highest probability downside in {HORIZONS.find(h => h.key === horizon)?.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
                : scanData?.bearish?.length > 0
                  ? scanData.bearish.map(s => (
                      <StockCard key={s.ticker} stock={s} weights={scanData.weights} />
                    ))
                  : <EmptyState side="bearish" />
              }
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 32, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Data via Yahoo Finance · Options signals are primary driver · Not financial advice · Cached 30 min
        </div>
      </div>
    </div>
  )
}

function EmptyState({ side }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{side === 'bullish' ? '🟢' : '🔴'}</div>
      <div style={{ fontSize: 13 }}>No strong {side} signals found for this horizon.</div>
    </div>
  )
}
