import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const FACTOR_COLOR = (s) => s >= 65 ? '#22c55e' : s >= 50 ? '#86efac' : s >= 35 ? '#f59e0b' : '#ef4444'

function FactorCard({ label, score, children }) {
  const color = FACTOR_COLOR(score)
  return (
    <div style={{ background: '#0f172a', border: `1px solid ${color}33`, borderRadius: 10, padding: '16px 18px', flex: 1, minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{score}</span>
      </div>
      <div style={{ height: 5, background: '#1e293b', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}

export default function SingleScore() {
  const ticker = useStore(s => s.ticker)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => { fetchScore() }, [ticker])

  async function fetchScore() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const result = await api.get(`/screener/score/${ticker}`)
      setData(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const VERDICT_COLOR = {
    'Strong Buy': '#22c55e', 'Buy': '#86efac',
    'Neutral': '#94a3b8', 'Sell': '#fca5a5', 'Strong Sell': '#ef4444',
  }

  return (
    <div className="pad" style={{ maxWidth: 900 }}>
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">🎯 Multi-Factor Score — {ticker}</h2>
          <p className="ai-section-sub">Full breakdown across all 4 signal dimensions</p>
        </div>
        <button className="btn-secondary" onClick={fetchScore} disabled={loading}>
          {loading ? 'Scoring…' : '↺ Refresh'}
        </button>
      </div>

      {loading && (
        <div className="ai-loading-card">
          <div className="ai-loading-icon">🎯</div>
          <div className="ai-loading-text">Scoring {ticker} across 4 factors…</div>
        </div>
      )}

      {error && <div className="error-box">⚠ {error}</div>}

      {data && (
        <>
          {/* Composite summary */}
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>COMPOSITE SCORE</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: FACTOR_COLOR(data.composite_score), lineHeight: 1 }}>
                  {data.composite_score}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>VERDICT</div>
                <span style={{
                  background: (VERDICT_COLOR[data.verdict] || '#94a3b8') + '22',
                  color: VERDICT_COLOR[data.verdict] || '#94a3b8',
                  border: `1px solid ${(VERDICT_COLOR[data.verdict] || '#94a3b8')}55`,
                  borderRadius: 6, fontSize: 15, fontWeight: 700, padding: '5px 14px',
                }}>
                  {data.verdict}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>PRICE</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>
                  ${data.price.toLocaleString()}
                  <span style={{ fontSize: 13, marginLeft: 8, color: data.change_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                    {data.change_pct >= 0 ? '+' : ''}{data.change_pct}%
                  </span>
                </div>
              </div>
            </div>
            {/* Composite bar */}
            <div style={{ marginTop: 16, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${data.composite_score}%`, height: '100%', background: FACTOR_COLOR(data.composite_score), borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          </div>

          {/* Factor cards */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <FactorCard label="Technical (30%)" score={data.scores.technical}>
              {data.detail.technical && (
                <>
                  <div>RSI: <b style={{ color: '#e2e8f0' }}>{data.detail.technical.rsi}</b></div>
                  <div>MACD: <b style={{ color: data.detail.technical.macd_bull ? '#22c55e' : '#ef4444' }}>
                    {data.detail.technical.macd_bull ? 'Bullish crossover' : 'Bearish crossover'}
                  </b></div>
                  <div>Trend: <b style={{ color: '#e2e8f0' }}>{data.detail.technical.trend}</b></div>
                  <div>52W percentile: <b style={{ color: '#e2e8f0' }}>{data.detail.technical.pct_52w}%</b></div>
                  {data.detail.technical.vol_surge && <div style={{ color: '#f59e0b' }}>⚡ Unusual volume today</div>}
                </>
              )}
            </FactorCard>

            <FactorCard label="Smart Money (30%)" score={data.scores.smart_money}>
              {data.detail.smart_money && (
                <>
                  <div>Options: <b style={{ color: data.detail.smart_money.options_score > 0 ? '#22c55e' : '#ef4444' }}>
                    {data.detail.smart_money.options_score > 0 ? '+' : ''}{data.detail.smart_money.options_score}
                  </b></div>
                  <div>Insider: <b style={{ color: data.detail.smart_money.insider_score > 0 ? '#22c55e' : '#ef4444' }}>
                    {data.detail.smart_money.insider_score > 0 ? '+' : ''}{data.detail.smart_money.insider_score}
                  </b></div>
                  <div>Institution: <b style={{ color: data.detail.smart_money.institution_score > 0 ? '#22c55e' : '#ef4444' }}>
                    {data.detail.smart_money.institution_score > 0 ? '+' : ''}{data.detail.smart_money.institution_score}
                  </b></div>
                  <div style={{ marginTop: 4, color: '#64748b' }}>
                    Wts: Options 40% · Insider 35% · Inst 25%
                  </div>
                </>
              )}
            </FactorCard>

            <FactorCard label="Fundamental (25%)" score={data.scores.fundamental}>
              {data.detail.fundamental && (
                <>
                  <div>Growth score: <b style={{ color: '#e2e8f0' }}>{data.detail.fundamental.growth_score}</b></div>
                  <div>Quality score: <b style={{ color: '#e2e8f0' }}>{data.detail.fundamental.quality_score}</b></div>
                  {data.detail.fundamental.pe_ratio != null && (
                    <div>P/E ratio: <b style={{ color: '#e2e8f0' }}>{data.detail.fundamental.pe_ratio}x</b></div>
                  )}
                  {data.detail.fundamental.revenue_growth_pct != null && (
                    <div>Rev growth YoY: <b style={{ color: data.detail.fundamental.revenue_growth_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {data.detail.fundamental.revenue_growth_pct >= 0 ? '+' : ''}{data.detail.fundamental.revenue_growth_pct}%
                    </b></div>
                  )}
                </>
              )}
            </FactorCard>

            <FactorCard label="Sentiment (15%)" score={data.scores.sentiment}>
              {data.detail.sentiment && (
                <>
                  <div>Label: <b style={{ color: '#e2e8f0' }}>{data.detail.sentiment.label}</b></div>
                  <div>Compound: <b style={{ color: (data.detail.sentiment.avg_compound || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {data.detail.sentiment.avg_compound >= 0 ? '+' : ''}{(data.detail.sentiment.avg_compound || 0).toFixed(3)}
                  </b></div>
                  {data.detail.sentiment.articles && (
                    <div>{data.detail.sentiment.articles} news articles via FinBERT</div>
                  )}
                </>
              )}
            </FactorCard>
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: '#475569' }}>
            Scores are 0-100 (50 = neutral) · Not financial advice · Data via yfinance + FinBERT
          </div>
        </>
      )}
    </div>
  )
}
