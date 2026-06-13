import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

// ── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ data, width = 400, height = 60, color = '#6366f1', refLines = [] }) {
  if (!data || data.length < 2) return null
  const valid = data.filter(v => v != null)
  if (valid.length < 2) return null

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1

  const pts = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {refLines.map((ref, i) => {
        const y = height - ((ref.value - min) / range) * (height - 4) - 2
        if (y < 0 || y > height) return null
        return (
          <line
            key={i}
            x1={0} y1={y.toFixed(1)}
            x2={width} y2={y.toFixed(1)}
            stroke={ref.color || '#334155'}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )
      })}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HistogramSparkline({ data, width = 400, height = 60 }) {
  if (!data || data.length < 2) return null
  const valid = data.filter(v => v != null)
  if (valid.length < 2) return null

  const absMax = Math.max(...valid.map(v => Math.abs(v))) || 1
  const barW = Math.max(1, (width / valid.length) - 1)

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeWidth={1} />
      {valid.map((v, i) => {
        const x = (i / valid.length) * width
        const barH = Math.abs(v) / absMax * (height / 2 - 2)
        const y = v >= 0 ? height / 2 - barH : height / 2
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={v >= 0 ? 'var(--bull)' : 'var(--bear)'}
            opacity={0.85}
          />
        )
      })}
    </svg>
  )
}

// ── Gauge for RSI ────────────────────────────────────────────────────────────

function RsiGauge({ value }) {
  if (value == null) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>—</div>
  const clamp = Math.max(0, Math.min(100, value))
  const pct = clamp / 100
  // arc from -π to 0 (semi-circle)
  const W = 120, H = 70, cx = 60, cy = 65, r = 48
  const angle = Math.PI + pct * Math.PI
  const nx = cx + r * Math.cos(angle)
  const ny = cy + r * Math.sin(angle)

  const arcColor = value < 30 ? 'var(--bull)' : value > 70 ? 'var(--bear)' : 'var(--gold)'
  const label = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--border-hi)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Colored arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx.toFixed(1)} ${ny.toFixed(1)}`}
          fill="none"
          stroke={arcColor}
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Needle tip */}
        <circle cx={nx.toFixed(1)} cy={ny.toFixed(1)} r={4} fill={arcColor} />
        {/* Zone markers */}
        <text x={cx - r - 2} y={cy + 14} fontSize={9} fill="var(--bull)" textAnchor="middle">30</text>
        <text x={cx + r + 2} y={cy + 14} fontSize={9} fill="var(--bear)" textAnchor="middle">70</text>
      </svg>
      <div style={{ fontSize: 26, fontWeight: 800, color: arcColor, letterSpacing: -1, marginTop: -8 }}>
        {value.toFixed(1)}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: arcColor }}>
        {label}
      </div>
    </div>
  )
}

// ── Badge helpers ────────────────────────────────────────────────────────────

function SignalBadge({ label, type }) {
  const colors = {
    bullish: { bg: 'var(--bull-dim)', color: 'var(--bull)', border: 'rgba(34,211,122,.25)' },
    oversold: { bg: 'var(--bull-dim)', color: 'var(--bull)', border: 'rgba(34,211,122,.25)' },
    lower: { bg: 'var(--bull-dim)', color: 'var(--bull)', border: 'rgba(34,211,122,.25)' },
    uptrend: { bg: 'var(--bull-dim)', color: 'var(--bull)', border: 'rgba(34,211,122,.25)' },
    bearish: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)' },
    overbought: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)' },
    upper: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)' },
    downtrend: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)' },
    neutral: { bg: 'rgba(80,88,120,.12)', color: 'var(--muted)', border: 'rgba(80,88,120,.2)' },
    sideways: { bg: 'rgba(80,88,120,.12)', color: 'var(--muted)', border: 'rgba(80,88,120,.2)' },
    golden_cross: { bg: 'var(--gold-dim)', color: 'var(--gold)', border: 'rgba(245,158,11,.25)' },
    death_cross: { bg: 'var(--bear-dim)', color: 'var(--bear)', border: 'rgba(240,82,82,.25)' },
  }
  const s = colors[type] || colors.neutral
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 20,
      fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.5,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {label}
    </span>
  )
}

function CardLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.7, color: 'var(--muted)', marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

function MetaRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function IndicatorsView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/technical/indicators/${ticker}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ticker])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>⚠️ {error}</div>
  if (!data) return null

  const { indicators: ind, signals, price, dates } = data

  const priceVsEma = (emaVal) => {
    if (!emaVal || !price) return null
    const diff = ((price - emaVal) / emaVal) * 100
    return { diff: diff.toFixed(2), color: diff >= 0 ? 'var(--bull)' : 'var(--bear)' }
  }

  const ema20cmp = priceVsEma(ind.ema20.value)
  const ema50cmp = priceVsEma(ind.ema50.value)
  const ema200cmp = priceVsEma(ind.ema200.value)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Signal Summary Bar */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginRight: 4 }}>
          {ticker} — ${price?.toFixed(2)}
        </span>
        <SignalBadge label={signals.trend} type={signals.trend} />
        <SignalBadge label={`RSI: ${signals.rsi_signal}`} type={signals.rsi_signal} />
        <SignalBadge label={`MACD: ${signals.macd_signal}`} type={signals.macd_signal} />
        <SignalBadge label={`BB: ${signals.bb_signal}`} type={signals.bb_signal} />
        {signals.golden_cross && <SignalBadge label="Golden Cross" type="golden_cross" />}
        {signals.death_cross && <SignalBadge label="Death Cross" type="death_cross" />}
      </div>

      {/* Top grid: RSI + MACD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>

        {/* RSI Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <CardLabel>RSI (14)</CardLabel>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Relative Strength Index</div>
            </div>
            <SignalBadge label={signals.rsi_signal} type={signals.rsi_signal} />
          </div>
          <RsiGauge value={ind.rsi.value} />
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
              60-Bar History
            </div>
            <Sparkline
              data={ind.rsi.history}
              width={280} height={50}
              color="var(--accent)"
              refLines={[
                { value: 70, color: 'rgba(240,82,82,.5)' },
                { value: 30, color: 'rgba(34,211,122,.5)' },
                { value: 50, color: '#334155' },
              ]}
            />
          </div>
        </div>

        {/* MACD Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <CardLabel>MACD (12, 26, 9)</CardLabel>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Moving Avg Convergence Divergence</div>
            </div>
            <SignalBadge label={signals.macd_signal} type={signals.macd_signal} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <MetaRow
                label="MACD Line"
                value={ind.macd.line?.toFixed(3) ?? '—'}
                color={ind.macd.line >= 0 ? 'var(--bull)' : 'var(--bear)'}
              />
              <MetaRow
                label="Signal"
                value={ind.macd.signal?.toFixed(3) ?? '—'}
                color="var(--accent-hi)"
              />
              <MetaRow
                label="Histogram"
                value={ind.macd.histogram?.toFixed(3) ?? '—'}
                color={ind.macd.histogram >= 0 ? 'var(--bull)' : 'var(--bear)'}
              />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
              Histogram
            </div>
            <HistogramSparkline data={ind.macd.history_histogram} width={280} height={48} />
          </div>
        </div>
      </div>

      {/* Second row: Bollinger Bands + EMA Stack */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>

        {/* Bollinger Bands */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <CardLabel>Bollinger Bands (20, 2σ)</CardLabel>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Volatility envelope</div>
            </div>
            <SignalBadge label={`BB: ${signals.bb_signal}`} type={signals.bb_signal} />
          </div>
          <MetaRow label="Upper Band" value={ind.bollinger.upper != null ? `$${ind.bollinger.upper.toFixed(2)}` : '—'} color="var(--bear)" />
          <MetaRow label="Middle (SMA20)" value={ind.bollinger.mid != null ? `$${ind.bollinger.mid.toFixed(2)}` : '—'} color="var(--accent-hi)" />
          <MetaRow label="Lower Band" value={ind.bollinger.lower != null ? `$${ind.bollinger.lower.toFixed(2)}` : '—'} color="var(--bull)" />
          <MetaRow label="Band Width %" value={ind.bollinger.width != null ? `${ind.bollinger.width.toFixed(2)}%` : '—'} />
          <MetaRow label="Current Price" value={price != null ? `$${price.toFixed(2)}` : '—'} color="var(--text)" />
          {/* %B gauge bar */}
          {ind.bollinger.pct_b != null && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                <span>0 (Lower)</span>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>%B: {(ind.bollinger.pct_b * 100).toFixed(1)}%</span>
                <span>1 (Upper)</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3,
                  width: `${Math.min(100, Math.max(0, ind.bollinger.pct_b * 100))}%`,
                  background: ind.bollinger.pct_b > 1 ? 'var(--bear)' : ind.bollinger.pct_b < 0 ? 'var(--bull)' : 'var(--accent)',
                  transition: 'width .4s',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* EMA Stack */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CardLabel>EMA Stack (20 / 50 / 200)</CardLabel>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
            Current Price: <strong style={{ color: 'var(--text)' }}>${price?.toFixed(2)}</strong>
          </div>
          {[
            { label: 'EMA 20', val: ind.ema20.value, cmp: ema20cmp },
            { label: 'EMA 50', val: ind.ema50.value, cmp: ema50cmp },
            { label: 'EMA 200', val: ind.ema200.value, cmp: ema200cmp },
          ].map(({ label, val, cmp }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>{label}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {val != null ? `$${val.toFixed(2)}` : '—'}
                </div>
                {cmp && (
                  <div style={{ fontSize: 10, color: cmp.color, fontWeight: 600 }}>
                    {cmp.diff > 0 ? '+' : ''}{cmp.diff}% vs price
                  </div>
                )}
              </div>
            </div>
          ))}
          {signals.golden_cross && (
            <div style={{ padding: '6px 10px', background: 'var(--gold-dim)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 6, fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
              ✦ Golden Cross detected (EMA20 crossed above EMA50)
            </div>
          )}
          {signals.death_cross && (
            <div style={{ padding: '6px 10px', background: 'var(--bear-dim)', border: '1px solid rgba(240,82,82,.25)', borderRadius: 6, fontSize: 12, color: 'var(--bear)', fontWeight: 600 }}>
              ✦ Death Cross detected (EMA20 crossed below EMA50)
            </div>
          )}
        </div>
      </div>

      {/* Third row: ATR + Stochastic + VWAP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>

        {/* ATR */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CardLabel>ATR (14) — Avg True Range</CardLabel>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: 'var(--text)' }}>
            {ind.atr.value != null ? `$${ind.atr.value.toFixed(2)}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {ind.atr.atr_pct != null ? (
              <span><strong style={{ color: 'var(--accent-hi)' }}>{ind.atr.atr_pct.toFixed(2)}%</strong> of current price</span>
            ) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Measures daily volatility range; higher ATR = more volatile.
          </div>
        </div>

        {/* Stochastic */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CardLabel>Stochastic (14, 3)</CardLabel>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>%K</div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: ind.stochastic.k > 80 ? 'var(--bear)' : ind.stochastic.k < 20 ? 'var(--bull)' : 'var(--text)' }}>
                {ind.stochastic.k != null ? ind.stochastic.k.toFixed(1) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>%D</div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: 'var(--accent-hi)' }}>
                {ind.stochastic.d != null ? ind.stochastic.d.toFixed(1) : '—'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {ind.stochastic.k > 80 ? 'Overbought zone (>80)' :
             ind.stochastic.k < 20 ? 'Oversold zone (<20)' : 'Neutral zone (20–80)'}
          </div>
          <Sparkline data={ind.stochastic.history_k} width={200} height={36} color="var(--accent)"
            refLines={[{ value: 80, color: 'rgba(240,82,82,.4)' }, { value: 20, color: 'rgba(34,211,122,.4)' }]} />
        </div>

        {/* VWAP */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CardLabel>VWAP (20-day Rolling)</CardLabel>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: 'var(--text)' }}>
            {ind.vwap.value != null ? `$${ind.vwap.value.toFixed(2)}` : '—'}
          </div>
          {ind.vwap.value && price && (
            <div style={{ fontSize: 12 }}>
              Price is{' '}
              <span style={{ fontWeight: 700, color: price >= ind.vwap.value ? 'var(--bull)' : 'var(--bear)' }}>
                {price >= ind.vwap.value ? 'above' : 'below'}
              </span>
              {' '}VWAP by{' '}
              <span style={{ fontWeight: 700, color: price >= ind.vwap.value ? 'var(--bull)' : 'var(--bear)' }}>
                {Math.abs(((price - ind.vwap.value) / ind.vwap.value) * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Volume-weighted average price — institutional benchmark.
          </div>
        </div>
      </div>
    </div>
  )
}
