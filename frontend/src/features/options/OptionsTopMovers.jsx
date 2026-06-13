import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const TIMEFRAMES = [
  { key: '1w',  label: '1 Week',   desc: 'Weekly expiry options' },
  { key: '1mo', label: '1 Month',  desc: '~30 DTE options' },
  { key: '3mo', label: '3 Months', desc: '~90 DTE options' },
  { key: '6mo', label: '6 Months', desc: '~180 DTE options' },
  { key: '1y',  label: '1 Year',   desc: 'LEAPS / long-dated' },
]

// Rank badge colors: gold / silver / bronze for top 3
const RANK_BG = {
  1: { bg: '#b8960c', fg: '#fff' },
  2: { bg: '#6b7280', fg: '#fff' },
  3: { bg: '#92400e', fg: '#fff' },
}

function RankBadge({ rank }) {
  const style = RANK_BG[rank] ?? { bg: 'var(--surface2)', fg: 'var(--muted)' }
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: style.bg, color: style.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: rank <= 3 ? 12 : 11, fontWeight: 700,
    }}>
      {rank}
    </div>
  )
}

function ScoreBar({ score }) {
  const pct   = (Math.abs(score) / 5) * 100
  const color = score > 0 ? 'var(--bull)' : 'var(--bear)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 22, textAlign: 'right' }}>
        {score > 0 ? '+' : ''}{score}
      </span>
      <div style={{ width: 52, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

function Chip({ label, val, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color ?? 'var(--text)', whiteSpace: 'nowrap' }}>{val ?? '—'}</span>
    </div>
  )
}

function StockRow({ rank, stock, isBull, onClick }) {
  const {
    ticker, score, spot_price, pc_ratio, atm_iv_pct,
    iv_rank, expected_move, signals, expiration_label,
  } = stock

  const hoverBorder = isBull ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'
  const hoverBg     = isBull ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)'

  const pcColor = pc_ratio < 0.8 ? 'var(--bull)' : pc_ratio > 1.2 ? 'var(--bear)' : 'var(--text)'
  const ivrColor = iv_rank > 70 ? 'var(--bear)' : iv_rank < 25 ? 'var(--bull)' : 'var(--text)'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid var(--border)', marginBottom: 5,
        transition: 'background .1s, border-color .1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.borderColor = hoverBorder
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = ''
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <RankBadge rank={rank} />

      {/* Ticker + price */}
      <div style={{ width: 76, flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', lineHeight: 1.2 }}>{ticker}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>${spot_price?.toFixed(2)}</div>
      </div>

      {/* Score + top signal */}
      <div style={{ width: 100, flexShrink: 0 }}>
        <ScoreBar score={score} />
        {signals?.[0] && (
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 98 }}>
            {signals[0]}
          </div>
        )}
      </div>

      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 14, flex: 1, flexWrap: 'wrap' }}>
        <Chip label="P/C"     val={pc_ratio?.toFixed(2)}                              color={pcColor} />
        <Chip label="ATM IV"  val={atm_iv_pct != null ? `${atm_iv_pct}%` : null} />
        <Chip label="IV Rank" val={iv_rank    != null ? Math.round(iv_rank) : null}   color={ivrColor} />
        <Chip label="±Move"   val={expected_move ? `±${expected_move.move_pct}%` : null} color="var(--accent)" />
        <Chip label="Expiry"  val={expiration_label} />
      </div>

      <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>→</span>
    </div>
  )
}

function Panel({ title, titleColor, emptyMsg, stocks, isBull, onStockClick }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{title}</span>
        {stocks.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{stocks.length} stocks</span>
        )}
      </div>

      {/* Column labels */}
      {stocks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, padding: '0 12px 6px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          <div style={{ width: 26, flexShrink: 0 }} />
          <div style={{ width: 76, flexShrink: 0 }}>Ticker</div>
          <div style={{ width: 100, flexShrink: 0 }}>Score</div>
          <div style={{ display: 'flex', gap: 14, flex: 1 }}>
            <div style={{ minWidth: 28 }}>P/C</div>
            <div style={{ minWidth: 40 }}>ATM IV</div>
            <div style={{ minWidth: 40 }}>IV Rank</div>
            <div style={{ minWidth: 36 }}>±Move</div>
            <div>Expiry</div>
          </div>
        </div>
      )}

      {stocks.length === 0
        ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>{emptyMsg}</div>
        : stocks.map((s, i) => (
            <StockRow key={s.ticker} rank={i + 1} stock={s} isBull={isBull} onClick={() => onStockClick(s.ticker)} />
          ))
      }
    </div>
  )
}

export default function OptionsTopMovers() {
  const { setTicker } = useStore()
  const navigate = useNavigate()
  const [timeframe, setTimeframe] = useState('1mo')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => { load() }, [timeframe])

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await api.get(`/options/top-movers?timeframe=${timeframe}`)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function goToStock(ticker) {
    setTicker(ticker)
    navigate('../chain')
  }

  const tf = TIMEFRAMES.find(t => t.key === timeframe)

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <div className="section-title">Options Flow Scanner — Top 20 Bullish &amp; Bearish</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Scans {data ? `${data.scanned} of ${data.universe_size}` : '80+'} liquid stocks across sectors.
          Ranked by P/C ratio, max pain &amp; IV rank. Click any row to open its full options chain.
        </div>
      </div>

      {/* ── Timeframe selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 2 }}>Horizon:</span>
        {TIMEFRAMES.map(t => {
          const active = timeframe === t.key
          return (
            <button key={t.key} onClick={() => setTimeframe(t.key)} title={t.desc} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              background: active ? 'var(--accent)' : 'var(--surface)',
              color:      active ? '#fff' : 'var(--muted)',
              border:     `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: active ? 700 : 400,
              transition: 'all .12s',
            }}>
              {t.label}
            </button>
          )
        })}

        <button onClick={load} disabled={loading} style={{
          marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, fontSize: 12,
          cursor: loading ? 'not-allowed' : 'pointer',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--muted)', opacity: loading ? 0.5 : 1,
        }}>
          ↻ Refresh
        </button>

        {data && !loading && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {data.scanned} scanned · {new Date(data.generated_at).toLocaleTimeString()} · cached 30 min
          </span>
        )}
      </div>

      {/* ── Active timeframe context ───────────────────────────────── */}
      {tf && (
        <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', padding: '7px 12px', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
          <strong style={{ color: 'var(--text)' }}>{tf.label} horizon</strong> — scanning options with {tf.desc} to measure current institutional positioning.
          {timeframe === '1w' && ' Weekly options are the most sensitive to short-term directional bets.'}
          {timeframe === '1y' && ' LEAPS reflect long-term conviction — less noise, more strategic positioning.'}
        </div>
      )}

      {error && <div className="error-box">⚠ {error}</div>}

      {/* ── Loading ────────────────────────────────────────────────── */}
      {loading && (
        <div className="spinner-wrap" style={{ flexDirection: 'column', gap: 10, padding: '60px 0' }}>
          <div className="spinner" />
          <span style={{ fontSize: 14 }}>Scanning {data?.universe_size ?? 80}+ stocks for options signals...</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>First scan takes ~25–40s. Results are cached for 30 minutes after.</span>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {!loading && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            <Panel
              title="🟢 Top 20 Bullish"
              titleColor="var(--bull)"
              emptyMsg="No strongly bullish options signals found for this timeframe."
              stocks={data.bullish}
              isBull={true}
              onStockClick={goToStock}
            />
            <Panel
              title="🔴 Top 20 Bearish"
              titleColor="var(--bear)"
              emptyMsg="No strongly bearish options signals found for this timeframe."
              stocks={data.bearish}
              isBull={false}
              onStockClick={goToStock}
            />
          </div>

          {/* ── Legend ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span><strong style={{ color: 'var(--text)' }}>Score</strong> −5 to +5</span>
            <span><strong style={{ color: 'var(--text)' }}>P/C</strong> Put/Call OI ratio</span>
            <span><strong style={{ color: 'var(--text)' }}>ATM IV</strong> At-the-money implied vol</span>
            <span><strong style={{ color: 'var(--text)' }}>IV Rank</strong> Current IV vs 52-week range (0–100)</span>
            <span><strong style={{ color: 'var(--text)' }}>±Move</strong> 1SD expected move to expiry</span>
            <span style={{ color: 'var(--bull)' }}>■ Green P/C = call-heavy</span>
            <span style={{ color: 'var(--bear)' }}>■ Red P/C = put-heavy</span>
          </div>

          {/* ── Scoring explainer ──────────────────────────────────── */}
          <div className="ov-glossary">
            <div className="ov-glossary-title">📊 How the Score is Calculated (−5 to +5)</div>
            <div className="ov-glossary-grid">
              {[
                {
                  term: 'P/C OI Ratio  ±3 points',
                  def:  'Primary signal. P/C < 0.6 = heavy call buying (+3, strongly bullish). P/C 0.6–0.8 = call-heavy (+2). P/C 0.8–1.0 = mild bullish (+1). Reversed for bearish. Tells you where institutional money is positioned.',
                },
                {
                  term: 'Max Pain Direction  ±1 point',
                  def:  'If max pain is >2% above spot, the price has a gravitational pull upward near expiry (+1). If >2% below spot, pull downward (−1). Market makers defend max pain levels.',
                },
                {
                  term: 'IV Rank  ±1 point',
                  def:  'IV rank > 70 means fear is elevated — often precedes downside (−1). IV rank < 25 means the market is complacent — often bullish environment (+1). Neutral between 25–70.',
                },
                {
                  term: 'Universe: 80+ stocks',
                  def:  'Covers Mag 7, semis, software, financials, healthcare, energy, consumer, ETFs, and high-vol names. Results cached 30 min. Click any stock to drill into its full chain, unusual activity, and IV skew.',
                },
              ].map(({ term, def }) => (
                <div key={term} className="ov-glossary-item">
                  <div className="ov-glossary-term">{term}</div>
                  <div className="ov-glossary-def">{def}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
