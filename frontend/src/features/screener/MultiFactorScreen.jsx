import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const VERDICT_COLOR = {
  'Strong Buy':  '#22c55e',
  'Buy':         '#86efac',
  'Neutral':     '#94a3b8',
  'Sell':        '#fca5a5',
  'Strong Sell': '#ef4444',
}

const FACTOR_COLOR = (score) =>
  score >= 65 ? '#22c55e' : score >= 50 ? '#86efac' : score >= 35 ? '#f59e0b' : '#ef4444'

const FACTOR_LABELS = {
  technical:   'Technical',
  smart_money: 'Smart $',
  fundamental: 'Fundamental',
  sentiment:   'Sentiment',
}

function ScoreBar({ value, width = 48 }) {
  const color = FACTOR_COLOR(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

function CompositeBar({ value }) {
  const color = VERDICT_COLOR[
    value >= 72 ? 'Strong Buy' : value >= 58 ? 'Buy' : value <= 28 ? 'Strong Sell' : value <= 42 ? 'Sell' : 'Neutral'
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 28, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

function VerdictBadge({ verdict }) {
  const color = VERDICT_COLOR[verdict] || '#94a3b8'
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px', whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  )
}

function TrendIcon({ trend }) {
  if (trend === 'uptrend')   return <span style={{ color: '#22c55e', fontSize: 11 }}>▲ Up</span>
  if (trend === 'downtrend') return <span style={{ color: '#ef4444', fontSize: 11 }}>▼ Down</span>
  return <span style={{ color: '#94a3b8', fontSize: 11 }}>→ Side</span>
}

export default function MultiFactorScreen() {
  const setTicker = useStore(s => s.setTicker)

  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [sortBy,    setSortBy]    = useState('composite_score')
  const [direction, setDirection] = useState('all')
  const [minScore,  setMinScore]  = useState(0)
  const [expandRow, setExpandRow] = useState(null)

  useEffect(() => { fetchScreen() }, [sortBy, direction, minScore])

  async function fetchScreen() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        sort_by: sortBy, direction, min_score: minScore, limit: 50,
      })
      const result = await api.get(`/screener/screen?${params}`)
      setData(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const rows = data?.results || []

  return (
    <div className="pad" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="ai-section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="ai-section-title">🔭 Multi-Factor Screener</h2>
          <p className="ai-section-sub">
            {data
              ? `${data.total} tickers scored · Technical 30% · Smart Money 30% · Fundamental 25% · Sentiment 15%`
              : 'Scores every ticker across 4 signal dimensions into one composite rank'}
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchScreen} disabled={loading}>
          {loading ? 'Scanning…' : '↺ Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Sort by</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}
          >
            <option value="composite_score">Composite Score</option>
            <option value="technical">Technical</option>
            <option value="smart_money">Smart Money</option>
            <option value="fundamental">Fundamental</option>
            <option value="sentiment">Sentiment</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Direction</span>
          {['all', 'bull', 'bear'].map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: direction === d ? (d === 'bear' ? '#ef444422' : d === 'bull' ? '#22c55e22' : '#334155') : '#1e293b',
                color: direction === d ? (d === 'bear' ? '#ef4444' : d === 'bull' ? '#22c55e' : '#e2e8f0') : '#64748b',
              }}
            >
              {d === 'all' ? 'All' : d === 'bull' ? '▲ Bull' : '▼ Bear'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Min score</span>
          <select
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}
          >
            <option value={0}>Any</option>
            <option value={55}>55+</option>
            <option value={60}>60+</option>
            <option value={65}>65+</option>
            <option value={70}>70+</option>
          </select>
        </div>
        {data && (
          <div style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', alignSelf: 'center' }}>
            Updated: {new Date(data.last_updated).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div className="error-box">⚠ {error}</div>}

      {/* Loading skeleton */}
      {loading && (
        <div className="ai-loading-card">
          <div className="ai-loading-icon">🔭</div>
          <div className="ai-loading-text">Scoring {data ? data.universe_size : '~50'} tickers across 4 factors…</div>
          <div className="ai-loading-sub">First run ~45s · Cached 30 min after that</div>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 72px 90px 110px 80px 80px 80px 80px 80px',
            gap: 0, padding: '8px 12px',
            fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
            borderBottom: '1px solid #1e293b',
          }}>
            <div>#</div>
            <div>Ticker</div>
            <div>Price</div>
            <div style={{ cursor: 'pointer' }} onClick={() => setSortBy('composite_score')}>
              Composite {sortBy === 'composite_score' ? '▼' : ''}
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => setSortBy('technical')}>
              Technical {sortBy === 'technical' ? '▼' : ''}
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => setSortBy('smart_money')}>
              Smart $ {sortBy === 'smart_money' ? '▼' : ''}
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => setSortBy('fundamental')}>
              Fundmtl {sortBy === 'fundamental' ? '▼' : ''}
            </div>
            <div style={{ cursor: 'pointer' }} onClick={() => setSortBy('sentiment')}>
              Sntmnt {sortBy === 'sentiment' ? '▼' : ''}
            </div>
            <div>Verdict</div>
          </div>

          {rows.map((row, i) => {
            const expanded = expandRow === row.ticker
            return (
              <div key={row.ticker}>
                <div
                  onClick={() => setExpandRow(expanded ? null : row.ticker)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 72px 90px 110px 80px 80px 80px 80px 80px',
                    gap: 0, padding: '10px 12px', cursor: 'pointer',
                    borderBottom: '1px solid #0f172a',
                    background: expanded ? '#0f172a' : i % 2 === 0 ? '#020817' : '#060d1a',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0f172a'}
                  onMouseLeave={e => e.currentTarget.style.background = expanded ? '#0f172a' : i % 2 === 0 ? '#020817' : '#060d1a'}
                >
                  <div style={{ fontSize: 11, color: '#475569', alignSelf: 'center' }}>{i + 1}</div>
                  <div style={{ alignSelf: 'center' }}>
                    <span
                      style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); setTicker(row.ticker) }}
                    >
                      {row.ticker}
                    </span>
                    <div style={{ fontSize: 10, color: row.change_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {row.change_pct >= 0 ? '+' : ''}{row.change_pct}%
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#cbd5e1', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    ${row.price.toLocaleString()}
                  </div>
                  <div style={{ alignSelf: 'center' }}>
                    <CompositeBar value={row.composite_score} />
                  </div>
                  <div style={{ alignSelf: 'center' }}><ScoreBar value={row.scores.technical} /></div>
                  <div style={{ alignSelf: 'center' }}><ScoreBar value={row.scores.smart_money} /></div>
                  <div style={{ alignSelf: 'center' }}><ScoreBar value={row.scores.fundamental} /></div>
                  <div style={{ alignSelf: 'center' }}><ScoreBar value={row.scores.sentiment} /></div>
                  <div style={{ alignSelf: 'center' }}><VerdictBadge verdict={row.verdict} /></div>
                </div>

                {/* Expanded detail row */}
                {expanded && (
                  <div style={{
                    background: '#0a1628', borderBottom: '1px solid #1e293b',
                    padding: '12px 16px', display: 'flex', gap: 20, flexWrap: 'wrap',
                  }}>
                    {/* Technical detail */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>TECHNICAL</div>
                      {row.detail.technical && (
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
                          <div>RSI: <b style={{ color: '#e2e8f0' }}>{row.detail.technical.rsi}</b></div>
                          <div>MACD: <b style={{ color: row.detail.technical.macd_bull ? '#22c55e' : '#ef4444' }}>
                            {row.detail.technical.macd_bull ? 'Bullish' : 'Bearish'}
                          </b></div>
                          <div>Trend: <TrendIcon trend={row.detail.technical.trend} /></div>
                          <div>52W pos: <b style={{ color: '#e2e8f0' }}>{row.detail.technical.pct_52w}%</b></div>
                          {row.detail.technical.vol_surge && <div style={{ color: '#f59e0b' }}>⚡ Volume surge</div>}
                        </div>
                      )}
                    </div>

                    {/* Smart money detail */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>SMART MONEY</div>
                      {row.detail.smart_money && (
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
                          <div>Options: <b style={{ color: row.detail.smart_money.options_score > 0 ? '#22c55e' : '#ef4444' }}>
                            {row.detail.smart_money.options_score > 0 ? '+' : ''}{row.detail.smart_money.options_score}
                          </b></div>
                          <div>Insider: <b style={{ color: row.detail.smart_money.insider_score > 0 ? '#22c55e' : '#ef4444' }}>
                            {row.detail.smart_money.insider_score > 0 ? '+' : ''}{row.detail.smart_money.insider_score}
                          </b></div>
                          <div>Institution: <b style={{ color: row.detail.smart_money.institution_score > 0 ? '#22c55e' : '#ef4444' }}>
                            {row.detail.smart_money.institution_score > 0 ? '+' : ''}{row.detail.smart_money.institution_score}
                          </b></div>
                        </div>
                      )}
                    </div>

                    {/* Fundamental detail */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>FUNDAMENTAL</div>
                      {row.detail.fundamental && (
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
                          <div>Growth: <b style={{ color: '#e2e8f0' }}>{row.detail.fundamental.growth_score}</b></div>
                          <div>Quality: <b style={{ color: '#e2e8f0' }}>{row.detail.fundamental.quality_score}</b></div>
                          {row.detail.fundamental.pe_ratio && (
                            <div>P/E: <b style={{ color: '#e2e8f0' }}>{row.detail.fundamental.pe_ratio}x</b></div>
                          )}
                          {row.detail.fundamental.revenue_growth_pct != null && (
                            <div>Rev growth: <b style={{ color: row.detail.fundamental.revenue_growth_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                              {row.detail.fundamental.revenue_growth_pct >= 0 ? '+' : ''}{row.detail.fundamental.revenue_growth_pct}%
                            </b></div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sentiment detail */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>SENTIMENT</div>
                      {row.detail.sentiment && (
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
                          <div>Label: <b style={{ color: '#e2e8f0' }}>{row.detail.sentiment.label}</b></div>
                          <div>Compound: <b style={{ color: (row.detail.sentiment.avg_compound || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                            {row.detail.sentiment.avg_compound >= 0 ? '+' : ''}{(row.detail.sentiment.avg_compound || 0).toFixed(3)}
                          </b></div>
                          {row.detail.sentiment.articles && (
                            <div>{row.detail.sentiment.articles} articles analyzed</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && rows.length === 0 && data && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>
          No tickers match the current filters.
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔭</div>
          <div style={{ fontSize: 15 }}>Press Refresh to run the screener</div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#475569' }}>
          Click any row to expand factor details · Click ticker to set global context · Not financial advice
        </div>
      )}
    </div>
  )
}
