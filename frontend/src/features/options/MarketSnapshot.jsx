import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

function KeyLevelRow({ level, spot }) {
  const isResistance = level.role === 'resistance'
  const color = isResistance ? 'var(--bear)' : 'var(--bull)'
  const icon = isResistance ? '⬆' : '⬇'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ color, fontWeight: 700, width: 16 }}>{icon}</span>
      <span style={{ fontWeight: 700, width: 56 }}>${level.strike}</span>
      <span style={{ color: 'var(--muted)', fontSize: 11, width: 60 }}>{level.pct_from_spot > 0 ? '+' : ''}{level.pct_from_spot}%</span>
      <span style={{ color, fontSize: 11, flex: 1 }}>{isResistance ? 'Resistance' : 'Support'}</span>
      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{level.oi?.toLocaleString()} OI</span>
      <span style={{ color: 'var(--muted)', fontSize: 10, width: 60, textAlign: 'right' }}>{level.significance}% of {isResistance ? 'call' : 'put'} OI</span>
    </div>
  )
}

function ExpectedMoveBar({ spot, lower, upper }) {
  const range = upper - lower
  const spotPct = range > 0 ? ((spot - lower) / range) * 100 : 50
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 24, background: 'var(--surface2)', borderRadius: 6, overflow: 'visible' }}>
        {/* range bar */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 12, background: 'linear-gradient(to right, var(--bear-dim, rgba(239,68,68,0.15)), var(--bull-dim, rgba(34,197,94,0.15)))', borderRadius: 4 }} />
        {/* lower label */}
        <div style={{ position: 'absolute', left: 2, top: 4, fontSize: 10, color: 'var(--bear)', fontWeight: 700 }}>${lower}</div>
        {/* upper label */}
        <div style={{ position: 'absolute', right: 2, top: 4, fontSize: 10, color: 'var(--bull)', fontWeight: 700 }}>${upper}</div>
        {/* spot marker */}
        <div style={{ position: 'absolute', left: `${Math.max(10, Math.min(90, spotPct))}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 2, height: 24, background: 'var(--accent)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--muted)' }}>
        <span>Downside target</span>
        <span style={{ color: 'var(--accent)' }}>Spot ${spot}</span>
        <span>Upside target</span>
      </div>
    </div>
  )
}

export default function MarketSnapshot({ onExpSelected }) {
  const { ticker, timeframe } = useStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => { load() }, [ticker, timeframe])

  async function load() {
    setLoading(true); setError(null); setData(null)
    try {
      const d = await api.get(`/options/analysis/${ticker}?timeframe=${timeframe}`)
      setData(d)
      // Tell parent which expiration was auto-selected
      if (d.selected_expiration?.date && onExpSelected) {
        onExpSelected(d.selected_expiration.date)
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Signal priority: ATM P/C (strips far-OTM hedges) > Volume P/C (live flow) > OI P/C (historical)
  // ATM-only ratio is the cleanest near-term directional signal for 1-week outlooks
  const signalRatio = data?.pc_atm_ratio ?? data?.pc_vol_ratio ?? data?.pc_ratio
  const pcColor = signalRatio > 1.1 ? 'var(--bear)' : signalRatio < 0.9 ? 'var(--bull)' : 'var(--muted)'
  const pcLabel = signalRatio > 1.3 ? 'Bearish' : signalRatio > 1.0 ? 'Mildly Bearish' : signalRatio > 0.7 ? 'Neutral' : 'Bullish'
  // Detect ATM vs overall flow conflict (far-OTM hedges distorting overall P/C)
  const hasConflict = data?.pc_atm_ratio != null && data?.pc_vol_ratio != null &&
    ((data.pc_atm_ratio > 1.0) !== (data.pc_vol_ratio > 1.0))

  return (
    <div className="card" style={{ marginBottom: 4 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>Market Snapshot</div>
          {data && (
            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 10 }}>
              {timeframe} · {data.selected_expiration.label} ({data.selected_expiration.dte}d)
            </span>
          )}
        </div>
        <button onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
          {collapsed ? '﹀' : '︿'}
        </button>
      </div>

      {!collapsed && (
        <>
          {error && <div className="error-box" style={{ marginBottom: 10 }}>⚠ {error}</div>}
          {loading && <div className="spinner-wrap"><div className="spinner" /><span>Analyzing options flow...</span></div>}

          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Left: Stats + Expected Move */}
              <div>
                {/* Stat chips */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  {[
                    { label: 'Spot',        val: `$${data.spot_price}`,                          color: 'var(--text)' },
                    { label: 'ATM IV',      val: `${data.atm_iv_pct ?? '—'}%`,                   color: 'var(--accent)' },
                    { label: 'P/C ATM',     val: data.pc_atm_ratio?.toFixed(2) ?? '—',           color: data?.pc_atm_ratio < 0.9 ? 'var(--bull)' : data?.pc_atm_ratio > 1.1 ? 'var(--bear)' : 'var(--muted)', title: 'Near-money P/C — strips out far-OTM portfolio hedges' },
                    { label: 'P/C Vol',     val: data.pc_vol_ratio?.toFixed(2) ?? '—',           color: data?.pc_vol_ratio < 0.9 ? 'var(--bull)' : data?.pc_vol_ratio > 1.1 ? 'var(--bear)' : 'var(--muted)', title: 'Overall volume P/C — includes far-OTM hedges' },
                    { label: 'Sentiment',   val: hasConflict ? '⚡ Hedged' : pcLabel,            color: hasConflict ? 'var(--gold)' : pcColor },
                    { label: 'Max Pain',    val: data.max_pain ? `$${data.max_pain}` : '—',      color: 'var(--gold)' },
                  ].map(({ label, val, color, title }) => (
                    <div key={label} title={title} style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: title ? 'help' : 'default' }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Expected Move */}
                {data.expected_move && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      Expected Move (1σ by {data.selected_expiration.label})
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      <span style={{ color: 'var(--bear)' }}>-${data.expected_move.move_dollar}</span>
                      <span style={{ color: 'var(--muted)', margin: '0 6px' }}>to</span>
                      <span style={{ color: 'var(--bull)' }}>+${data.expected_move.move_dollar}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>(±{data.expected_move.move_pct}%)</span>
                    </div>
                    <ExpectedMoveBar
                      spot={data.spot_price}
                      lower={data.expected_move.lower}
                      upper={data.expected_move.upper}
                    />
                  </div>
                )}

                {/* Narrative */}
                {data.narrative && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                    {data.narrative}
                  </div>
                )}
              </div>

              {/* Right: Key OI Levels */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                  Key OI Levels
                </div>
                {data.key_levels.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>No significant levels found.</div>
                ) : (
                  data.key_levels.map((level, i) => (
                    <KeyLevelRow key={i} level={level} spot={data.spot_price} />
                  ))
                )}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}
