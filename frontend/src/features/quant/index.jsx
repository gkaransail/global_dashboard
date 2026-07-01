import { useState, useEffect, useRef, useCallback } from 'react'
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
  regime:      '#a78bfa',
  momentum:    '#38bdf8',
  reversion:   '#fbbf24',
  factor:      '#4ade80',
  volatility:  '#f87171',
  fundamental: '#fb923c',
  sentiment:   '#e879f9',
  options:     '#22d3ee',
  ensemble:    '#f0abfc',
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
          const fill = d.value === 1 ? '#4ade8022' : d.value === -1 ? '#f8717122' : '#fbbf2418'
          return <rect key={i} x={x} y={0} width={w} height={H} fill={fill} />
        })}
        {/* Regime boundary line */}
        {last.map((d, i) => {
          if (i === 0) return null
          if (last[i - 1].value === d.value) return null
          const x = (i / last.length) * W
          return <line key={`l${i}`} x1={x} y1={0} x2={x} y2={H} stroke="var(--border)" strokeWidth={1} strokeDasharray="2,2" />
        })}
        {(() => {
          const cur = last[last.length - 1]
          const color = cur?.value === 1 ? '#4ade80' : cur?.value === -1 ? '#f87171' : '#fbbf24'
          const label = cur?.value === 1 ? 'BULL' : cur?.value === -1 ? 'BEAR' : 'SIDE'
          return <text x={W - 4} y={H / 2 + 4} fontSize={9} fill={color} textAnchor="end" fontWeight="700">{label}</text>
        })()}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: '#4ade80' }}>■ Bull</span>
        <span style={{ color: '#fbbf24' }}>■ Sideways</span>
        <span style={{ color: '#f87171' }}>■ Bear</span>
      </div>
    </div>
  )
}

// ── Bollinger Band chart ──────────────────────────────────────────────────────

function BollingerChart({ chartData }) {
  const series = chartData?.price_series ?? []
  if (series.length < 20) return null

  const W = 560, H = 80
  const prices = series.map(d => d.price)
  const uppers = series.map(d => d.upper).filter(Boolean)
  const lowers = series.map(d => d.lower).filter(Boolean)
  const allVals = [...prices, ...uppers, ...lowers].filter(Boolean)
  const minV = Math.min(...allVals) * 0.998
  const maxV = Math.max(...allVals) * 1.002
  const scaleY = v => H - ((v - minV) / (maxV - minV)) * H
  const scaleX = i => (i / (series.length - 1)) * W

  const polyline = (vals) =>
    vals.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ')

  // Band fill polygon
  const bandPoly = series
    .map((d, i) => d.upper ? `${scaleX(i)},${scaleY(d.upper)}` : '')
    .filter(Boolean)
    .concat(
      series.slice().reverse()
        .map((d, i) => d.lower ? `${scaleX(series.length - 1 - i)},${scaleY(d.lower)}` : '')
        .filter(Boolean)
    ).join(' ')

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Bollinger Bands (20d, 2σ) — last 6 months</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6 }}>
        {/* Band fill */}
        <polygon points={bandPoly} fill="#fbbf2415" />
        {/* Upper band */}
        <polyline points={polyline(uppers)} fill="none" stroke="#fbbf2460" strokeWidth={1} />
        {/* Lower band */}
        <polyline points={polyline(lowers)} fill="none" stroke="#fbbf2460" strokeWidth={1} />
        {/* Mean */}
        <polyline points={polyline(series.map(d => d.mean).filter(Boolean))}
          fill="none" stroke="#fbbf2490" strokeWidth={1} strokeDasharray="4,3" />
        {/* Price */}
        <polyline points={polyline(prices)} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {/* Current price dot */}
        <circle cx={scaleX(series.length - 1)} cy={scaleY(prices[prices.length - 1])}
          r={3} fill="var(--accent)" />
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: 'var(--accent)' }}>— Price</span>
        <span style={{ color: '#fbbf24' }}>— Bands / Mean</span>
      </div>
    </div>
  )
}

// ── Z-score chart ─────────────────────────────────────────────────────────────

function ZScoreChart({ chartData, meta }) {
  const series = chartData?.z_series ?? []
  if (series.length < 20) return null

  const W = 560, H = 70
  const zVals = series.map(d => d.z)
  const minV  = Math.min(-2.5, ...zVals)
  const maxV  = Math.max(2.5, ...zVals)
  const scaleY = v => H - ((v - minV) / (maxV - minV)) * H
  const scaleX = i => (i / (series.length - 1)) * W
  const zeroY  = scaleY(0)
  const p1Y    = scaleY(1), n1Y = scaleY(-1)
  const p2Y    = scaleY(2), n2Y = scaleY(-2)

  const polyline = zVals.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ')
  const currentZ = zVals[zVals.length - 1]
  const zColor = currentZ < -1 ? 'var(--bull)' : currentZ > 1 ? 'var(--bear)' : 'var(--muted)'

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Z-score (20d) — last 6 months</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        {/* Overbought zone */}
        <rect x={0} y={p2Y} width={W} height={p1Y - p2Y} fill="#f8717110" />
        {/* Oversold zone */}
        <rect x={0} y={n1Y} width={W} height={n2Y - n1Y} fill="#4ade8010" />
        {/* Reference lines */}
        {[[zeroY, '#ffffff20', ''], [p1Y, '#f8717140', ''], [n1Y, '#4ade8040', ''],
          [p2Y, '#f87171aa', '2σ'], [n2Y, '#4ade80aa', '-2σ']].map(([y, c, label], i) => (
          <g key={i}>
            <line x1={0} y1={y} x2={W} y2={y} stroke={c} strokeWidth={1} strokeDasharray={i > 0 ? '3,3' : ''} />
            {label && <text x={W - 2} y={y - 2} fontSize={8} fill={c} textAnchor="end">{label}</text>}
          </g>
        ))}
        {/* Z-score line */}
        <polyline points={polyline} fill="none" stroke={zColor} strokeWidth={1.5} />
        {/* Current dot */}
        <circle cx={scaleX(series.length - 1)} cy={scaleY(currentZ)} r={3} fill={zColor} />
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--bull)' }}>■ Oversold zone</span>
        <span style={{ color: 'var(--bear)' }}>■ Overbought zone</span>
        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
          Current Z: <strong style={{ color: zColor }}>{currentZ > 0 ? '+' : ''}{currentZ?.toFixed(2)}</strong>
        </span>
      </div>
    </div>
  )
}

// ── Realized vol chart (volatility) ──────────────────────────────────────────

function RealizedVolChart({ chartData }) {
  const series = chartData?.vol_series ?? []
  if (series.length < 10) return null

  const W = 560, H = 80
  const allVals = series.flatMap(d => [d.rv10, d.rv21, d.rv63]).filter(Boolean)
  const minV = 0
  const maxV = Math.max(...allVals) * 1.05
  const sy = v => H - ((v - minV) / (maxV - minV)) * H
  const sx = i => (i / (series.length - 1)) * W

  const line = (key, color, dash) => {
    const pts = series.map((d, i) => `${sx(i)},${sy(d[key])}`).join(' ')
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={dash || ''} />
  }

  // Shade the area under rv21
  const areaTop = series.map((d, i) => `${sx(i)},${sy(d.rv21)}`).join(' ')
  const areaBot = `${sx(series.length - 1)},${H} ${sx(0)},${H}`

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Realized Volatility — last 6 months (annualised %)</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        <polygon points={`${areaTop} ${areaBot}`} fill="#a78bfa15" />
        {line('rv63', '#fbbf2466', '4,3')}
        {line('rv21', '#a78bfa',   '')}
        {line('rv10', '#38bdf8aa', '')}
        <circle cx={sx(series.length - 1)} cy={sy(series[series.length - 1].rv21)}
          r={3} fill="#a78bfa" />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: '#38bdf8' }}>— RV10</span>
        <span style={{ color: '#a78bfa' }}>— RV21</span>
        <span style={{ color: '#fbbf24' }}>--- RV63</span>
      </div>
    </div>
  )
}

// ── VIX chart (volatility) ────────────────────────────────────────────────────

function VIXChart({ chartData }) {
  const series = chartData?.vix_series ?? []
  if (series.length < 10) return null

  const W = 560, H = 70
  const vixVals = series.map(d => d.vix)
  const minV = Math.min(...vixVals) * 0.95
  const maxV = Math.max(...vixVals) * 1.05
  const sy = v => H - ((v - minV) / (maxV - minV)) * H
  const sx = i => (i / (series.length - 1)) * W

  const pts = vixVals.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')
  const area = `${pts} ${sx(series.length - 1)},${H} ${sx(0)},${H}`

  // Threshold lines
  const thresholds = [
    { v: 15, label: '15', color: '#4ade8066' },
    { v: 20, label: '20', color: '#fbbf2466' },
    { v: 30, label: '30', color: '#f8717166' },
  ].filter(t => t.v >= minV && t.v <= maxV)

  const currentVix = vixVals[vixVals.length - 1]

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>VIX — 1 year</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        <polygon points={area} fill={currentVix > 25 ? '#f8717115' : currentVix > 18 ? '#fbbf2410' : '#4ade8010'} />
        {thresholds.map(t => (
          <g key={t.v}>
            <line x1={0} y1={sy(t.v)} x2={W} y2={sy(t.v)} stroke={t.color} strokeWidth={1} strokeDasharray="3,3" />
            <text x={4} y={sy(t.v) - 2} fontSize={8} fill={t.color}>{t.label}</text>
          </g>
        ))}
        <polyline points={pts} fill="none"
          stroke={currentVix > 25 ? '#f87171' : currentVix > 18 ? '#fbbf24' : '#4ade80'}
          strokeWidth={1.5} />
        <circle cx={sx(series.length - 1)} cy={sy(currentVix)} r={3}
          fill={currentVix > 25 ? '#f87171' : currentVix > 18 ? '#fbbf24' : '#4ade80'} />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: '#4ade80' }}>Low (&lt;15)</span>
        <span style={{ color: '#fbbf24' }}>Normal (15-20)</span>
        <span style={{ color: '#f87171' }}>Elevated/High (&gt;20)</span>
      </div>
    </div>
  )
}

// ── GARCH conditional vol chart ───────────────────────────────────────────────

function GarchVolChart({ chartData }) {
  const hist = chartData?.cond_vol_series ?? []
  const fc   = chartData?.forecast_series ?? []
  const lrVol = chartData?.lr_vol
  const anchor = chartData?.anchor_vol

  if (hist.length < 10) return null

  const W = 560, H = 90
  const allVols = [...hist.map(d => d.vol), ...fc.map(d => d.vol), lrVol].filter(Boolean)
  const minV = Math.max(0, Math.min(...allVols) * 0.9)
  const maxV = Math.max(...allVols) * 1.1
  const sy = v => H - ((v - minV) / (maxV - minV)) * H
  const totalPoints = hist.length + fc.length
  const sx = i => (i / (totalPoints - 1)) * W

  const histPts  = hist.map((d, i) => `${sx(i)},${sy(d.vol)}`).join(' ')
  const fcPts    = [
    `${sx(hist.length - 1)},${sy(anchor ?? hist[hist.length - 1].vol)}`,
    ...fc.map((d, i) => `${sx(hist.length + i)},${sy(d.vol)}`),
  ].join(' ')

  const lrY = lrVol != null ? sy(lrVol) : null
  const divX = (hist.length / totalPoints) * W

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
        GARCH(1,1) Conditional Volatility — 6 months + 10-day forecast (annualised %)
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        {/* Forecast zone shading */}
        <rect x={divX} y={0} width={W - divX} height={H} fill="#ffffff06" />
        {/* Long-run vol reference line */}
        {lrY != null && (
          <g>
            <line x1={0} y1={lrY} x2={W} y2={lrY} stroke="#fbbf2466" strokeWidth={1} strokeDasharray="4,3" />
            <text x={W - 3} y={lrY - 3} fontSize={8} fill="#fbbf24aa" textAnchor="end">LR {lrVol}%</text>
          </g>
        )}
        {/* Divider between history and forecast */}
        <line x1={divX} y1={0} x2={divX} y2={H} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />
        {/* Historical conditional vol — area fill */}
        <polygon
          points={`${histPts} ${sx(hist.length - 1)},${H} ${sx(0)},${H}`}
          fill="#f8717115"
        />
        {/* Historical line */}
        <polyline points={histPts} fill="none" stroke="#f87171" strokeWidth={1.5} />
        {/* Forecast line — dashed */}
        <polyline points={fcPts} fill="none" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5,3" />
        {/* Current vol dot */}
        <circle cx={sx(hist.length - 1)} cy={sy(hist[hist.length - 1].vol)} r={3} fill="#f87171" />
        {/* "Forecast" label */}
        <text x={divX + 4} y={10} fontSize={8} fill="var(--muted)">Forecast →</text>
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: '#f87171' }}>— Conditional Vol</span>
        <span style={{ color: '#f87171', opacity: 0.6 }}>--- 10d Forecast</span>
        <span style={{ color: '#fbbf24' }}>--- Long-Run Vol</span>
      </div>
    </div>
  )
}

// ── Confluence score bars ─────────────────────────────────────────────────────

function ConfluenceScoreBars({ chartData, meta }) {
  const bars = chartData?.score_bars ?? []
  if (!bars.length) return null

  const COLOR = { options: '#22d3ee', flow: '#a78bfa', combined: '#f0abfc' }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
        Directional scores (−1 = max bearish → +1 = max bullish)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bars.map(b => {
          const pct    = Math.abs(b.score) * 50     // max 50% of half-bar
          const bull   = b.score > 0
          const color  = b.score > 0.05 ? 'var(--bull)' : b.score < -0.05 ? 'var(--bear)' : 'var(--muted)'
          const accent = COLOR[b.type] || 'var(--accent)'
          const isCombined = b.type === 'combined'
          return (
            <div key={b.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: accent, width: 130, flexShrink: 0, fontWeight: isCombined ? 800 : 500 }}>
                  {b.label}
                </span>
                <div style={{
                  flex: 1, display: 'flex', height: isCombined ? 20 : 14,
                  position: 'relative',
                  background: 'var(--surface2)', borderRadius: 4,
                  border: isCombined ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: bull ? '50%' : `${50 - pct}%`,
                    width: `${pct}%`,
                    height: '100%',
                    background: color,
                    borderRadius: 4,
                    opacity: isCombined ? 1 : 0.8,
                  }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                </div>
                <span style={{
                  fontSize: isCombined ? 14 : 12,
                  fontWeight: 800, color,
                  width: 52, textAlign: 'right', flexShrink: 0,
                }}>
                  {b.score > 0 ? '+' : ''}{b.score.toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {/* Agreement / conflict badge */}
      {meta && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 8,
          background: meta.conflict ? '#f8717115' : meta.agreement ? '#4ade8015' : 'var(--surface2)',
          border: `1px solid ${meta.conflict ? '#f8717140' : meta.agreement ? '#4ade8040' : 'var(--border)'}`,
          fontSize: 12, color: meta.conflict ? 'var(--bear)' : meta.agreement ? 'var(--bull)' : 'var(--muted)',
          fontWeight: 700,
        }}>
          {meta.conflict
            ? '⚡ Signal conflict — options and order flow disagree'
            : meta.agreement
              ? '✓ Dual confirmation — both sources agree on direction'
              : '◆ Partial signal — one source is neutral'
          }
        </div>
      )}
    </div>
  )
}

// ── Factor beta bars ──────────────────────────────────────────────────────────

function FactorBars({ chartData }) {
  const bars = chartData?.factor_bars ?? []
  if (!bars.length) return null
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.beta)), 0.1)

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Factor Loadings (β)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bars.map(b => {
          const pct  = (Math.abs(b.beta) / maxAbs) * 50   // max 50% of half-width
          const bull = b.beta > 0
          const color = bull ? 'var(--bull)' : 'var(--bear)'
          const sigDot = b.significant ? <span style={{ color: '#fbbf24', marginLeft: 3 }}>★</span> : null
          return (
            <div key={b.factor} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', width: 160, flexShrink: 0 }}>{b.factor}</span>
              {/* Centre-origin bar */}
              <div style={{ flex: 1, display: 'flex', height: 16, position: 'relative', background: 'var(--surface2)', borderRadius: 4 }}>
                <div style={{
                  position: 'absolute',
                  left: bull ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 4,
                  opacity: b.significant ? 1 : 0.45,
                }} />
                {/* Zero line */}
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 54, textAlign: 'right', flexShrink: 0 }}>
                {b.beta > 0 ? '+' : ''}{b.beta.toFixed(3)}{sigDot}
              </span>
              <span style={{ fontSize: 11, color: b.contribution > 0 ? 'var(--bull)' : 'var(--bear)', width: 56, textAlign: 'right', flexShrink: 0 }}>
                {b.contribution > 0 ? '+' : ''}{b.contribution.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
        <span>★ = p &lt; 0.05</span>
        <span style={{ marginLeft: 'auto' }}>Right column: 63d factor contribution (ann.)</span>
      </div>
    </div>
  )
}

// ── Rolling alpha chart ───────────────────────────────────────────────────────

function RollingAlphaChart({ chartData }) {
  const series = chartData?.roll_alpha ?? []
  if (series.length < 10) return null

  const W = 560, H = 70
  const vals = series.map(d => d.alpha)
  const absMax = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals)), 5) * 1.1
  const sy = v => H / 2 - (v / absMax) * (H / 2)
  const sx = i => (i / (series.length - 1)) * W
  const zeroY = H / 2

  const pts = vals.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')
  const areaAbove = vals.map((v, i) => `${sx(i)},${sy(Math.max(v, 0))}`).join(' ')
  const areaBelow = vals.map((v, i) => `${sx(i)},${sy(Math.min(v, 0))}`).join(' ')
  const currentAlpha = vals[vals.length - 1]

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
        Rolling Alpha (63d window, annualised) — last 6 months
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#ffffff20" strokeWidth={1} />
        <polygon points={`${areaAbove} ${sx(series.length-1)},${zeroY} ${sx(0)},${zeroY}`} fill="#4ade8020" />
        <polygon points={`${areaBelow} ${sx(series.length-1)},${zeroY} ${sx(0)},${zeroY}`} fill="#f8717120" />
        <polyline points={pts} fill="none"
          stroke={currentAlpha > 0 ? 'var(--bull)' : 'var(--bear)'} strokeWidth={1.5} />
        <circle cx={sx(series.length-1)} cy={sy(currentAlpha)} r={3}
          fill={currentAlpha > 0 ? 'var(--bull)' : 'var(--bear)'} />
        <text x={W - 3} y={zeroY - 3} fontSize={8} fill="#ffffff30" textAnchor="end">0%</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--muted)' }}>Rolling Jensen's α</span>
        <span style={{ color: currentAlpha > 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 700 }}>
          Current: {currentAlpha > 0 ? '+' : ''}{currentAlpha?.toFixed(1)}% p.a.
        </span>
      </div>
    </div>
  )
}

// ── Alpha Percentile Bar (replaces CumReturnChart in factor model) ────────────

function AlphaPercentileBar({ chartData, meta }) {
  const pct = chartData?.alpha_pct ?? 50
  const alpha = meta?.alpha_annual ?? 0
  const color = pct >= 70 ? 'var(--bull)' : pct <= 30 ? 'var(--bear)' : '#fbbf24'
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Alpha Percentile vs Rolling History
      </div>
      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
            Current α {alpha > 0 ? '+' : ''}{alpha}% p.a. ranks at
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color }}>{pct}th percentile</span>
        </div>
        <div style={{ height: 12, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, var(--bear), #fbbf24 50%, var(--bull))' }} />
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pct}%`,
            width: 3, background: '#fff', borderRadius: 2, transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
          <span>0th (worst alpha)</span>
          <span>100th (best alpha)</span>
        </div>
      </div>
    </div>
  )
}

// ── Momentum bucket bars ──────────────────────────────────────────────────────

function BucketBars({ chartData }) {
  const bars = chartData?.bucket_bars ?? []
  if (!bars.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Bucket Scores (−1 bearish → +1 bullish)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bars.map(b => {
          const pct = (Math.abs(b.score) / 1) * 50
          const bull = b.score > 0
          const color = bull ? 'var(--bull)' : b.score < 0 ? 'var(--bear)' : 'var(--muted)'
          return (
            <div key={b.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', width: 160, flexShrink: 0 }}>{b.bucket}</span>
              <div style={{ flex: 1, display: 'flex', height: 16, position: 'relative', background: 'var(--surface2)', borderRadius: 4 }}>
                <div style={{
                  position: 'absolute',
                  left: bull ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`,
                  height: '100%', background: color, borderRadius: 4,
                }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 48, textAlign: 'right', flexShrink: 0 }}>
                {b.score > 0 ? '+' : ''}{b.score.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fundamental pillar bars ───────────────────────────────────────────────────

function PillarBars({ chartData }) {
  const bars = chartData?.pillar_bars ?? []
  if (!bars.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Pillar Scores (0–20 each)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bars.map(b => {
          const pct = (b.score / b.max) * 100
          const color = pct >= 65 ? 'var(--bull)' : pct >= 40 ? '#fbbf24' : 'var(--bear)'
          return (
            <div key={b.pillar} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', width: 120, flexShrink: 0 }}>{b.pillar}</span>
              <div style={{ flex: 1, height: 14, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 44, textAlign: 'right', flexShrink: 0 }}>
                {b.score}/{b.max}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sentiment article bars ────────────────────────────────────────────────────

function SentimentBars({ chartData }) {
  const bars = chartData?.article_bars ?? []
  if (!bars.length) return null
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.compound)), 0.1)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Article Sentiment (FinBERT compound score)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {bars.map((b, i) => {
          const pct = (Math.abs(b.compound) / maxAbs) * 45
          const bull = b.compound > 0
          const color = bull ? 'var(--bull)' : b.compound < 0 ? 'var(--bear)' : 'var(--muted)'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', height: 14, position: 'relative', background: 'var(--surface2)', borderRadius: 4 }}>
                <div style={{
                  position: 'absolute',
                  left: bull ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`, height: '100%', background: color, borderRadius: 4, opacity: 0.8,
                }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color, width: 38, textAlign: 'right', flexShrink: 0 }}>
                {b.compound > 0 ? '+' : ''}{b.compound.toFixed(2)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {b.title}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Options flow bars ─────────────────────────────────────────────────────────

function FlowBars({ chartData }) {
  const bars = chartData?.flow_bars ?? []
  if (!bars.length) return null
  const maxPrem = Math.max(...bars.map(b => b.premium), 1)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Top Unusual Contracts (by premium)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bars.map((b, i) => {
          const pct = (b.premium / maxPrem) * 100
          const color = b.type === 'call' ? 'var(--bull)' : 'var(--bear)'
          const fmtPrem = b.premium >= 1e6 ? `$${(b.premium / 1e6).toFixed(1)}M` : `$${(b.premium / 1e3).toFixed(0)}K`
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color, width: 14, fontWeight: 800, flexShrink: 0 }}>{b.type === 'call' ? 'C' : 'P'}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{b.label}</span>
              <div style={{ flex: 1, height: 12, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, opacity: 0.7 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color, width: 54, textAlign: 'right', flexShrink: 0 }}>{fmtPrem}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── IV skew bars ──────────────────────────────────────────────────────────────

function SkewBars({ chartData }) {
  const bars = chartData?.skew_bars ?? []
  if (!bars.length) return null
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.skew || 0)), 0.05)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>IV Skew by Expiry (+ = put skew = fear)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bars.map((b, i) => {
          const pct = (Math.abs(b.skew || 0) / maxAbs) * 45
          const bull = (b.skew || 0) < 0
          const color = bull ? 'var(--bull)' : 'var(--bear)'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 70, flexShrink: 0 }}>{b.expiration} ({b.dte}d)</span>
              <div style={{ flex: 1, display: 'flex', height: 12, position: 'relative', background: 'var(--surface2)', borderRadius: 4 }}>
                <div style={{
                  position: 'absolute',
                  left: bull ? `${50 - pct}%` : '50%',
                  width: `${pct}%`, height: '100%', background: color, borderRadius: 4, opacity: 0.7,
                }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color, width: 48, textAlign: 'right', flexShrink: 0 }}>
                {b.skew > 0 ? '+' : ''}{(b.skew || 0).toFixed(3)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Ensemble vote bars ────────────────────────────────────────────────────────

function EnsembleVotes({ chartData }) {
  const bars = chartData?.vote_bars ?? []
  if (!bars.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Model Votes (weighted contribution)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bars.map((b, i) => {
          const maxAbs = Math.max(...bars.map(x => Math.abs(x.weighted)), 0.1)
          const pct = (Math.abs(b.weighted) / maxAbs) * 45
          const bull = b.weighted > 0
          const color = bull ? 'var(--bull)' : b.weighted < 0 ? 'var(--bear)' : 'var(--muted)'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 160, flexShrink: 0 }}>{b.model}</span>
              <div style={{ flex: 1, display: 'flex', height: 14, position: 'relative', background: 'var(--surface2)', borderRadius: 4 }}>
                <div style={{
                  position: 'absolute',
                  left: bull ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`, height: '100%', background: color, borderRadius: 4,
                }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color, width: 44, textAlign: 'right', flexShrink: 0 }}>
                {b.weighted > 0 ? '+' : ''}{b.weighted.toFixed(3)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 52, textAlign: 'right', flexShrink: 0 }}>
                {b.confidence.toFixed(0)}% conf
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── EMA chart (momentum) ─────────────────────────────────────────────────────

function EMAChart({ chartData }) {
  const series = chartData?.price_series ?? []
  if (series.length < 20) return null

  const W = 560, H = 90
  const allVals = series.flatMap(d => [d.price, d.ema20, d.ema50, d.ema200].filter(Boolean))
  const minV = Math.min(...allVals) * 0.997
  const maxV = Math.max(...allVals) * 1.003
  const sy = v => H - ((v - minV) / (maxV - minV)) * H
  const sx = i => (i / (series.length - 1)) * W

  const line = (key, color, width = 1) => {
    const pts = series.map((d, i) => d[key] ? `${sx(i)},${sy(d[key])}` : null).filter(Boolean)
    return pts.length > 1 ? <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={width} /> : null
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Price vs EMAs — last 6 months</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        {line('ema200', '#f8717155', 1)}
        {line('ema50',  '#fbbf2480', 1.2)}
        {line('ema20',  '#38bdf870', 1)}
        {line('price',  'var(--accent)', 1.8)}
        <circle cx={sx(series.length - 1)} cy={sy(series[series.length - 1].price)}
          r={3} fill="var(--accent)" />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--accent)' }}>— Price</span>
        <span style={{ color: '#38bdf8' }}>— EMA20</span>
        <span style={{ color: '#fbbf24' }}>— EMA50</span>
        <span style={{ color: '#f87171' }}>— EMA200</span>
      </div>
    </div>
  )
}

// ── MACD chart (momentum) ─────────────────────────────────────────────────────

function MACDChart({ chartData }) {
  const series = chartData?.macd_series ?? []
  if (series.length < 10) return null

  const W = 560, H = 60
  const allVals = series.flatMap(d => [d.macd, d.signal, d.hist])
  const absMax  = Math.max(Math.abs(Math.min(...allVals)), Math.abs(Math.max(...allVals))) * 1.1 || 1
  const sy = v => H / 2 - (v / absMax) * (H / 2)
  const sx = i => (i / (series.length - 1)) * W
  const zeroY = H / 2

  const linePts = (key) => series.map((d, i) => `${sx(i)},${sy(d[key])}`).join(' ')

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>MACD (12/26/9) — last 4 months</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 6, background: 'var(--surface2)' }}>
        {/* Zero line */}
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#ffffff15" strokeWidth={1} />
        {/* Histogram bars */}
        {series.map((d, i) => {
          const x = sx(i), barW = Math.max(W / series.length - 0.5, 1)
          const top = Math.min(sy(d.hist), zeroY), h = Math.abs(sy(d.hist) - zeroY)
          return <rect key={i} x={x - barW / 2} y={top} width={barW} height={Math.max(h, 0.5)}
            fill={d.hist >= 0 ? '#4ade8044' : '#f8717144'} />
        })}
        {/* MACD line */}
        <polyline points={linePts('macd')} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
        {/* Signal line */}
        <polyline points={linePts('signal')} fill="none" stroke="#f87171" strokeWidth={1} strokeDasharray="3,2" />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: '#38bdf8' }}>— MACD</span>
        <span style={{ color: '#f87171' }}>--- Signal</span>
        <span style={{ color: '#4ade80' }}>■ Hist +</span>
        <span style={{ color: '#f87171' }}>■ Hist −</span>
      </div>
    </div>
  )
}

// ── Transition matrix ─────────────────────────────────────────────────────────

function TransitionMatrix({ matrix }) {
  if (!matrix) return null
  const keys = Object.keys(matrix)
  const is3state = keys.some(k => k.includes('Sideways'))
  const stateColor = { Bull: '#4ade80', Sideways: '#fbbf24', Bear: '#f87171' }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Transition probabilities</div>
      <div style={{ display: 'grid', gridTemplateColumns: is3state ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6 }}>
        {keys.map(key => {
          const [from, to] = key.split('→')
          const color = stateColor[to] || 'var(--text)'
          const v = matrix[key]
          return (
            <div key={key} style={{
              background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{key}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: v > 70 ? color : 'var(--text)' }}>
                {v}%
              </span>
            </div>
          )
        })}
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

  const catColor  = CATEGORY_COLOR[result.category] || CATEGORY_COLOR[result.model_id?.split('_')[0]] || 'var(--accent)'
  const dirColor  = DIRECTION_COLOR[String(result.direction)] || 'var(--muted)'
  const dirLabel  = DIRECTION_LABEL[String(result.direction)] || '—'
  const tfCfg     = TIMEFRAME_CONFIG[result.timeframe] || null

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: catColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {result.model_name}
            </span>
            {tfCfg && (
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 8,
                background: `${tfCfg.color}20`, color: tfCfg.color, fontWeight: 700,
              }}>
                {tfCfg.icon} {tfCfg.label}
              </span>
            )}
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

          {/* Model-specific charts */}
          {result.model_id === 'regime_detection' && result.chart_data && (
            <RegimeChart chartData={result.chart_data} />
          )}
          {result.model_id === 'mean_reversion' && result.chart_data && (
            <>
              <BollingerChart chartData={result.chart_data} />
              <ZScoreChart chartData={result.chart_data} meta={result.meta} />
            </>
          )}
          {result.model_id === 'momentum' && result.chart_data && (
            <>
              <BucketBars chartData={result.chart_data} />
              <EMAChart chartData={result.chart_data} />
              <MACDChart chartData={result.chart_data} />
            </>
          )}
          {result.model_id === 'volatility_regime' && result.chart_data && (
            <>
              <VIXChart chartData={result.chart_data} />
              <RealizedVolChart chartData={result.chart_data} />
            </>
          )}
          {result.model_id === 'garch' && result.chart_data && (
            <GarchVolChart chartData={result.chart_data} />
          )}
          {result.model_id === 'confluence' && result.chart_data && (
            <ConfluenceScoreBars chartData={result.chart_data} meta={result.meta} />
          )}
          {result.model_id === 'factor_model' && result.chart_data && (
            <>
              <FactorBars chartData={result.chart_data} />
              <RollingAlphaChart chartData={result.chart_data} />
              <AlphaPercentileBar chartData={result.chart_data} meta={result.meta} />
            </>
          )}
          {result.model_id === 'fundamental_health' && result.chart_data && (
            <PillarBars chartData={result.chart_data} />
          )}
          {result.model_id === 'sentiment' && result.chart_data && (
            <SentimentBars chartData={result.chart_data} />
          )}
          {result.model_id === 'options_flow' && result.chart_data && (
            <>
              <FlowBars chartData={result.chart_data} />
              <SkewBars chartData={result.chart_data} />
            </>
          )}
          {result.model_id === 'ensemble' && result.chart_data && (
            <EnsembleVotes chartData={result.chart_data} />
          )}

          {/* Model-specific extras */}
          {result.meta?.transition_matrix && (
            <TransitionMatrix matrix={result.meta.transition_matrix} />
          )}

          {/* Mean reversion key stats */}
          {result.model_id === 'mean_reversion' && result.meta && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {[
                { label: 'Z-score 20d', value: result.meta.z_score_20d != null ? (result.meta.z_score_20d > 0 ? '+' : '') + result.meta.z_score_20d.toFixed(2) : '—', color: result.meta.z_score_20d < -1 ? 'var(--bull)' : result.meta.z_score_20d > 1 ? 'var(--bear)' : 'var(--text)' },
                { label: 'Z-score 50d', value: result.meta.z_score_50d != null ? (result.meta.z_score_50d > 0 ? '+' : '') + result.meta.z_score_50d.toFixed(2) : '—', color: result.meta.z_score_50d < -1 ? 'var(--bull)' : result.meta.z_score_50d > 1 ? 'var(--bear)' : 'var(--text)' },
                { label: 'Bollinger %B', value: result.meta.pct_b != null ? result.meta.pct_b.toFixed(2) : '—', color: result.meta.pct_b < 0.2 ? 'var(--bull)' : result.meta.pct_b > 0.8 ? 'var(--bear)' : 'var(--text)' },
                { label: 'RSI (14)', value: result.meta.rsi ?? '—', color: result.meta.rsi < 35 ? 'var(--bull)' : result.meta.rsi > 65 ? 'var(--bear)' : 'var(--text)' },
                { label: 'OU Half-life', value: result.meta.half_life_days != null ? `${result.meta.half_life_days}d` : 'n/a', color: 'var(--text)' },
                { label: 'ADF p-value', value: result.meta.adf_pvalue != null ? result.meta.adf_pvalue.toFixed(3) : '—', color: result.meta.adf_stationary ? 'var(--bull)' : 'var(--muted)' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 80px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Momentum key stats */}
          {result.model_id === 'momentum' && result.meta && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { label: '1M Return', value: result.meta.ret_1m },
                  { label: '3M Return', value: result.meta.ret_3m },
                  { label: '6M Return', value: result.meta.ret_6m },
                  { label: '12M Return', value: result.meta.ret_12m },
                  { label: '3M vs SPY', value: result.meta.rs_3m_vs_spy },
                  { label: '6M vs SPY', value: result.meta.rs_6m_vs_spy },
                ].map(s => {
                  const c = s.value == null ? 'var(--muted)' : s.value > 0 ? 'var(--bull)' : 'var(--bear)'
                  return (
                    <div key={s.label} style={{ flex: '1 1 70px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c }}>
                        {s.value != null ? `${s.value > 0 ? '+' : ''}${s.value}%` : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Composite score</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: result.meta.score > 0.15 ? 'var(--bull)' : result.meta.score < -0.15 ? 'var(--bear)' : 'var(--muted)' }}>
                  {result.meta.score > 0 ? '+' : ''}{result.meta.score?.toFixed(3)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>ADX {result.meta.adx}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>52w: {result.meta.pos_52w_pct}%</span>
              </div>
            </div>
          )}

          {/* Volatility regime key stats */}
          {result.model_id === 'volatility_regime' && result.meta && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { label: 'VIX', value: `${result.meta.vix} (${result.meta.vix_regime})`, color: result.meta.vix > 25 ? 'var(--bear)' : result.meta.vix > 18 ? '#fbbf24' : 'var(--bull)' },
                  { label: 'VIX Pct', value: `${result.meta.vix_percentile}th`, color: result.meta.vix_percentile > 70 ? 'var(--bear)' : result.meta.vix_percentile < 30 ? 'var(--bull)' : 'var(--text)' },
                  { label: 'RV 10d', value: `${result.meta.rv10}%`, color: result.meta.rv10 > 50 ? 'var(--bear)' : result.meta.rv10 < 20 ? 'var(--bull)' : 'var(--text)' },
                  { label: 'RV 21d', value: `${result.meta.rv21}%`, color: result.meta.rv21 > 40 ? 'var(--bear)' : result.meta.rv21 < 20 ? 'var(--bull)' : 'var(--text)' },
                  { label: 'RV 63d', value: `${result.meta.rv63}%`, color: 'var(--text)' },
                  { label: 'Parkinson', value: `${result.meta.parkinson_vol}%`, color: 'var(--text)' },
                  { label: 'EWMA Vol', value: `${result.meta.ewma_vol}%`, color: 'var(--text)' },
                  { label: 'ATR Pct', value: `${result.meta.atr_percentile}th`, color: result.meta.atr_percentile > 75 ? 'var(--bear)' : 'var(--text)' },
                ].map(s => (
                  <div key={s.label} style={{ flex: '1 1 70px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Vol composite score bar */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Vol score</span>
                <div style={{ flex: 1, height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${result.meta.vol_composite}%`,
                    background: result.meta.vol_composite > 60 ? 'var(--bear)' : result.meta.vol_composite < 35 ? 'var(--bull)' : '#fbbf24',
                    transition: 'width .4s',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: result.meta.vol_composite > 60 ? 'var(--bear)' : result.meta.vol_composite < 35 ? 'var(--bull)' : '#fbbf24' }}>
                  {result.meta.vol_composite}/100
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                  {result.meta.vol_term_structure}
                </span>
              </div>
            </div>
          )}

          {/* GARCH key stats */}
          {result.model_id === 'garch' && result.meta && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { label: 'Cond. Vol', value: `${result.meta.current_cond_vol}%`, color: result.meta.current_cond_vol > result.meta.lr_vol * 1.3 ? 'var(--bear)' : result.meta.current_cond_vol < result.meta.lr_vol * 0.75 ? 'var(--bull)' : 'var(--text)' },
                  { label: 'Long-Run Vol', value: `${result.meta.lr_vol}%`, color: 'var(--text)' },
                  { label: 'Vol Pct', value: `${result.meta.vol_percentile}th`, color: result.meta.vol_percentile > 75 ? 'var(--bear)' : result.meta.vol_percentile < 25 ? 'var(--bull)' : 'var(--text)' },
                  { label: '10d Forecast', value: `${result.meta.fc_10d_avg}%`, color: result.meta.fc_slope > 0.5 ? 'var(--bear)' : result.meta.fc_slope < -0.5 ? 'var(--bull)' : 'var(--text)' },
                ].map(s => (
                  <div key={s.label} style={{ flex: '1 1 80px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Parameters row */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Model Parameters</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'ω (omega)', value: result.meta.omega },
                    { label: 'α (alpha)', value: result.meta.alpha },
                    { label: 'β (beta)', value: result.meta.beta },
                    { label: 'α+β persist.', value: result.meta.persistence },
                  ].map(p => (
                    <div key={p.label} style={{ textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{p.label}</div>
                      <div style={{
                        fontSize: 13, fontWeight: 800,
                        color: p.label === 'α+β persist.' && p.value > 0.97 ? 'var(--bear)' : 'var(--text)',
                      }}>
                        {p.value}
                      </div>
                    </div>
                  ))}
                </div>
                {result.meta.persistence > 0.97 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>
                    ⚠ Near-integrated process — vol shocks are highly persistent
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confluence key stats */}
          {result.model_id === 'confluence' && result.meta && (
            <div style={{ marginTop: 14 }}>
              {/* Score tiles */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { label: 'Options Score', value: `${result.meta.options_score > 0 ? '+' : ''}${result.meta.options_score?.toFixed(2)}`, color: result.meta.options_score > 0.1 ? 'var(--bull)' : result.meta.options_score < -0.1 ? 'var(--bear)' : 'var(--muted)' },
                  { label: 'Flow Score',    value: `${result.meta.flow_score > 0 ? '+' : ''}${result.meta.flow_score?.toFixed(2)}`,    color: result.meta.flow_score > 0.1 ? 'var(--bull)' : result.meta.flow_score < -0.1 ? 'var(--bear)' : 'var(--muted)' },
                  { label: 'Combined',      value: `${result.meta.combined_score > 0 ? '+' : ''}${result.meta.combined_score?.toFixed(2)}`, color: result.meta.combined_score > 0.1 ? 'var(--bull)' : result.meta.combined_score < -0.1 ? 'var(--bear)' : 'var(--muted)' },
                  { label: 'PC_ATM',        value: result.meta.pc_atm != null ? result.meta.pc_atm.toFixed(2) : '—', color: result.meta.pc_atm < 0.8 ? 'var(--bull)' : result.meta.pc_atm > 1.2 ? 'var(--bear)' : 'var(--text)' },
                ].map(s => (
                  <div key={s.label} style={{ flex: '1 1 80px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Flow context row */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { label: 'Cum Delta',  value: result.meta.cum_delta != null ? (result.meta.cum_delta > 0 ? '+' : '') + result.meta.cum_delta.toLocaleString() : '—', color: result.meta.cum_delta > 0 ? 'var(--bull)' : result.meta.cum_delta < 0 ? 'var(--bear)' : 'var(--muted)' },
                  { label: 'vs VWAP',   value: result.meta.vwap_pct != null ? `${result.meta.vwap_pct > 0 ? '+' : ''}${result.meta.vwap_pct.toFixed(2)}%` : '—', color: result.meta.vwap_pct > 0 ? 'var(--bull)' : 'var(--bear)' },
                  { label: 'Max Pain',  value: result.meta.max_pain != null ? `$${result.meta.max_pain}` : '—', color: 'var(--text)' },
                  { label: 'GEX Env',   value: result.meta.gex_env ?? '—', color: result.meta.gex_env === 'negative' ? 'var(--bear)' : result.meta.gex_env === 'positive' ? 'var(--bull)' : 'var(--muted)' },
                ].map(s => (
                  <div key={s.label} style={{ flex: '1 1 80px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Special flags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {result.meta.squeeze && (
                  <div style={{ padding: '6px 12px', borderRadius: 8, background: '#fbbf2420', border: '1px solid #fbbf2440', fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>
                    ⚡ Squeeze candidate
                  </div>
                )}
                {result.meta.divergence === 'bearish' && (
                  <div style={{ padding: '6px 12px', borderRadius: 8, background: '#f8717120', border: '1px solid #f8717140', fontSize: 12, color: 'var(--bear)', fontWeight: 700 }}>
                    ⚠ Bearish price/delta divergence
                  </div>
                )}
                {result.meta.divergence === 'bullish' && (
                  <div style={{ padding: '6px 12px', borderRadius: 8, background: '#4ade8020', border: '1px solid #4ade8040', fontSize: 12, color: 'var(--bull)', fontWeight: 700 }}>
                    ⚠ Bullish price/delta divergence
                  </div>
                )}
                {result.meta.conflict_note && (
                  <div style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#f8717108', border: '1px solid #f8717130', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                    <span style={{ color: 'var(--bear)', fontWeight: 700 }}>Conflict: </span>
                    {result.meta.conflict_note}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Factor model key stats */}
          {result.model_id === 'factor_model' && result.meta && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                { label: "Jensen's α", value: `${result.meta.alpha_annual > 0 ? '+' : ''}${result.meta.alpha_annual}% p.a.`, color: result.meta.alpha_annual > 0 ? 'var(--bull)' : result.meta.alpha_annual < 0 ? 'var(--bear)' : 'var(--muted)', sub: result.meta.alpha_significant ? '★ significant' : `p=${result.meta.alpha_pval}` },
                { label: 'R²', value: `${result.meta.r_squared}%`, color: result.meta.r_squared > 60 ? 'var(--bull)' : 'var(--text)', sub: 'variance explained' },
                { label: 'Resid. Vol', value: `${result.meta.resid_vol}%`, color: 'var(--text)', sub: 'idiosyncratic' },
                { label: 'Market β', value: result.meta.betas?.MKT != null ? `${result.meta.betas.MKT > 0 ? '+' : ''}${result.meta.betas.MKT}` : '—', color: result.meta.betas?.MKT > 1.2 ? 'var(--bear)' : result.meta.betas?.MKT < 0.8 ? 'var(--bull)' : 'var(--text)', sub: 'market sensitivity' },
                { label: 'Factor Contrib.', value: `${result.meta.total_factor_contribution > 0 ? '+' : ''}${result.meta.total_factor_contribution}% p.a.`, color: result.meta.total_factor_contribution > 0 ? 'var(--bull)' : 'var(--bear)', sub: '63d annualised' },
                { label: 'Predicted', value: `${result.meta.predicted_annual > 0 ? '+' : ''}${result.meta.predicted_annual}% p.a.`, color: result.meta.predicted_annual > 0 ? 'var(--bull)' : 'var(--bear)', sub: 'α + factors' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 90px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Regime state avg returns (3-state) */}
          {result.meta?.bull_state_annual_return != null && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1, background: '#4ade8012', border: '1px solid #4ade8030', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Bull avg return</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bull)' }}>
                  {result.meta.bull_state_annual_return > 0 ? '+' : ''}{fmt(result.meta.bull_state_annual_return)}% p.a.
                </div>
              </div>
              {result.meta.sideways_state_annual_return != null && (
                <div style={{ flex: 1, background: '#fbbf2412', border: '1px solid #fbbf2430', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Sideways avg return</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>
                    {result.meta.sideways_state_annual_return > 0 ? '+' : ''}{fmt(result.meta.sideways_state_annual_return)}% p.a.
                  </div>
                </div>
              )}
              <div style={{ flex: 1, background: '#f8717112', border: '1px solid #f8717130', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Bear avg return</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bear)' }}>
                  {fmt(result.meta.bear_state_annual_return)}% p.a.
                </div>
              </div>
            </div>
          )}

          {/* Fundamental health meta */}
          {result.model_id === 'fundamental_health' && result.meta && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                { label: 'Total Score', value: `${result.meta.total_score}/100`, color: result.meta.total_score >= 65 ? 'var(--bull)' : result.meta.total_score <= 35 ? 'var(--bear)' : '#fbbf24' },
                { label: 'ROE', value: result.meta.roe != null ? `${result.meta.roe}%` : '—', color: result.meta.roe > 15 ? 'var(--bull)' : result.meta.roe < 0 ? 'var(--bear)' : 'var(--text)' },
                { label: 'Net Margin', value: result.meta.net_margin != null ? `${result.meta.net_margin}%` : '—', color: result.meta.net_margin > 10 ? 'var(--bull)' : result.meta.net_margin < 0 ? 'var(--bear)' : 'var(--text)' },
                { label: 'FCF Yield', value: result.meta.fcf_yield != null ? `${result.meta.fcf_yield}%` : '—', color: result.meta.fcf_yield > 4 ? 'var(--bull)' : 'var(--text)' },
                { label: 'P/E', value: result.meta.pe_ratio ?? '—', color: result.meta.pe_ratio > 40 ? 'var(--bear)' : result.meta.pe_ratio < 15 ? 'var(--bull)' : 'var(--text)' },
                { label: 'Analyst', value: result.meta.analyst_upside != null ? `${result.meta.analyst_upside > 0 ? '+' : ''}${result.meta.analyst_upside}%` : '—', color: result.meta.analyst_upside > 10 ? 'var(--bull)' : result.meta.analyst_upside < -10 ? 'var(--bear)' : 'var(--text)' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 80px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sentiment meta */}
          {result.model_id === 'sentiment' && result.meta && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                { label: 'Compound', value: `${result.meta.avg_compound > 0 ? '+' : ''}${result.meta.avg_compound?.toFixed(3)}`, color: result.meta.avg_compound > 0.1 ? 'var(--bull)' : result.meta.avg_compound < -0.1 ? 'var(--bear)' : 'var(--muted)' },
                { label: '% Bullish', value: `${(result.meta.bull_ratio * 100).toFixed(0)}%`, color: result.meta.bull_ratio > 0.5 ? 'var(--bull)' : 'var(--text)' },
                { label: '% Neutral', value: `${(result.meta.neutral_ratio * 100).toFixed(0)}%`, color: 'var(--muted)' },
                { label: '% Bearish', value: `${(result.meta.bear_ratio * 100).toFixed(0)}%`, color: result.meta.bear_ratio > 0.5 ? 'var(--bear)' : 'var(--text)' },
                { label: 'Articles', value: result.meta.article_count, color: 'var(--text)' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 70px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Options flow meta */}
          {result.model_id === 'options_flow' && result.meta && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                { label: 'Contracts', value: result.meta.contract_count, color: 'var(--text)' },
                { label: 'Call Prem', value: result.meta.call_premium >= 1e6 ? `$${(result.meta.call_premium/1e6).toFixed(1)}M` : `$${(result.meta.call_premium/1e3).toFixed(0)}K`, color: 'var(--bull)' },
                { label: 'Put Prem', value: result.meta.put_premium >= 1e6 ? `$${(result.meta.put_premium/1e6).toFixed(1)}M` : `$${(result.meta.put_premium/1e3).toFixed(0)}K`, color: 'var(--bear)' },
                { label: 'C/P Ratio', value: result.meta.premium_ratio?.toFixed(2), color: result.meta.premium_ratio > 1.5 ? 'var(--bull)' : result.meta.premium_ratio < 0.7 ? 'var(--bear)' : 'var(--text)' },
                { label: 'IV Skew', value: result.meta.avg_skew != null ? (result.meta.avg_skew > 0 ? '+' : '') + result.meta.avg_skew.toFixed(3) : '—', color: result.meta.avg_skew > 0.05 ? 'var(--bear)' : result.meta.avg_skew < -0.05 ? 'var(--bull)' : 'var(--text)' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 70px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Ensemble meta */}
          {result.model_id === 'ensemble' && result.meta && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {[
                { label: 'Wtd. Score', value: `${result.meta.weighted_score > 0 ? '+' : ''}${result.meta.weighted_score?.toFixed(3)}`, color: result.meta.weighted_score > 0.15 ? 'var(--bull)' : result.meta.weighted_score < -0.15 ? 'var(--bear)' : 'var(--muted)' },
                { label: 'Agreement', value: `${(result.meta.agreement * 100).toFixed(0)}%`, color: result.meta.agreement > 0.7 ? 'var(--bull)' : 'var(--muted)' },
                { label: 'Bull', value: result.meta.bull_count, color: 'var(--bull)' },
                { label: 'Neutral', value: result.meta.neutral_count, color: 'var(--muted)' },
                { label: 'Bear', value: result.meta.bear_count, color: 'var(--bear)' },
              ].map(s => (
                <div key={s.label} style={{ flex: '1 1 70px', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Timeframe config ──────────────────────────────────────────────────────────

const TIMEFRAME_CONFIG = {
  short: {
    label: 'Short-Term',
    sublabel: 'Days → ~2 weeks',
    color: '#f59e0b',
    icon: '⚡',
    description: 'React quickly to price dislocations, news flow, and options positioning',
  },
  long: {
    label: 'Long-Term',
    sublabel: 'Weeks → Months',
    color: '#34d399',
    icon: '📈',
    description: 'Structural trends, factor exposures, and fundamental business quality',
  },
  meta: {
    label: 'Meta / Consensus',
    sublabel: 'Spans all horizons',
    color: '#c084fc',
    icon: '🔮',
    description: 'Weighted consensus across all models — best for a complete view',
  },
}

// ── Model selector card ───────────────────────────────────────────────────────

function ModelCard({ model, selected, onToggle }) {
  const color = CATEGORY_COLOR[model.category] || 'var(--accent)'
  const tf = TIMEFRAME_CONFIG[model.timeframe] || TIMEFRAME_CONFIG.long
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
          background: `${color}22`, color, flexShrink: 0,
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

  // Search / autocomplete state
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef(null)
  const wrapperRef = useRef(null)

  // Load available models on mount
  useEffect(() => {
    api.get('/quant/models')
      .then(r => {
        setModels(r.models || [])
        setSelected((r.models || []).map(m => m.id))
      })
      .catch(() => {})
  }, [])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleModel = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const run = async (tickerOverride) => {
    const t = (tickerOverride || inputVal).trim().toUpperCase()
    if (!t || !selected.length) return
    setTicker(t)
    setInputVal(t)
    setShowSuggestions(false)
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

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputVal(val)

    clearTimeout(searchTimer.current)
    if (val.trim().length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await api.get(`/quant/search?q=${encodeURIComponent(val.trim())}`)
        setSuggestions(r.results || [])
        setShowSuggestions((r.results || []).length > 0)
      } catch {
        setSuggestions([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') { run(); setShowSuggestions(false) }
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  const pickSuggestion = (sym) => {
    setInputVal(sym)
    setShowSuggestions(false)
    run(sym)
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧮 Quant Model Workbench</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Apply institutional-grade quantitative models to any stock and compare their signals
        </p>
      </div>

      {/* Stock input with autocomplete */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'flex-start' }}>
        <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
          <input
            value={inputVal}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search by ticker or company name — e.g. NVDA or Nvidia"
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 8, fontSize: 15, fontWeight: 600,
              border: `1px solid ${showSuggestions ? 'var(--accent)' : 'var(--border)'}`,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              letterSpacing: '.3px', boxSizing: 'border-box',
            }}
          />
          {searchLoading && (
            <div style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: 'var(--muted)',
            }}>searching…</div>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--accent)',
              borderRadius: 10, zIndex: 100, overflow: 'hidden',
              boxShadow: '0 8px 24px #00000040',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onMouseDown={() => pickSuggestion(s.symbol)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 12,
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', minWidth: 56 }}>
                    {s.symbol}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                    {s.exchange}{s.sector ? ` · ${s.sector}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => run()}
          disabled={loading || !inputVal.trim() || !selected.length}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: loading ? 'var(--muted)' : '#000',
            fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? '⏳ Running…' : '▶ Analyze'}
        </button>
      </div>

      {/* Model selector — grouped by timeframe */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Select Models
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
              ({selected.length}/{models.length} selected)
            </span>
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {['short', 'long', 'meta'].map(tf => {
              const cfg = TIMEFRAME_CONFIG[tf]
              const ids = models.filter(m => m.timeframe === tf).map(m => m.id)
              const allSel = ids.length > 0 && ids.every(id => selected.includes(id))
              return (
                <button
                  key={tf}
                  onClick={() => {
                    if (allSel) {
                      setSelected(prev => prev.filter(id => !ids.includes(id)))
                    } else {
                      setSelected(prev => [...new Set([...prev, ...ids])])
                    }
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: `1px solid ${allSel ? cfg.color : 'var(--border)'}`,
                    background: allSel ? `${cfg.color}20` : 'var(--surface)',
                    color: allSel ? cfg.color : 'var(--muted)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              )
            })}
            <button
              onClick={() => setSelected(models.map(m => m.id))}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              All
            </button>
            <button
              onClick={() => setSelected([])}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              None
            </button>
          </div>
        </div>

        {!models.length && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading models…</div>
        )}

        {['short', 'long', 'meta'].map(tf => {
          const cfg = TIMEFRAME_CONFIG[tf]
          const group = models.filter(m => m.timeframe === tf)
          if (!group.length) return null
          return (
            <div key={tf} style={{ marginBottom: 16 }}>
              {/* Group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
                padding: '8px 14px', borderRadius: 8,
                background: `${cfg.color}10`, border: `1px solid ${cfg.color}30`,
              }}>
                <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>
                    {cfg.label}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: `${cfg.color}99` }}>
                      {cfg.sublabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{cfg.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                {group.map(m => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    selected={selected.includes(m.id)}
                    onToggle={() => toggleModel(m.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
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
