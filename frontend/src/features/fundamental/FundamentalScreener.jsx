import { useState, useEffect } from 'react'
import { api } from '../../core/api'

function fmtMarketCap(val) {
  if (val == null) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(0)}M`
  return `$${val.toLocaleString()}`
}

const VERDICT_STYLE = {
  'Strong Buy': { color: '#22d37a', bg: 'rgba(34,211,122,0.1)', border: 'rgba(34,211,122,0.25)' },
  'Buy':        { color: '#86efac', bg: 'rgba(34,211,122,0.07)', border: 'rgba(34,211,122,0.15)' },
  'Neutral':    { color: '#a0aac8', bg: 'rgba(80,88,120,0.1)',  border: 'rgba(80,88,120,0.2)' },
  'Expensive':  { color: '#f87171', bg: 'rgba(240,82,82,0.1)',  border: 'rgba(240,82,82,0.2)' },
  'Weak':       { color: '#fca5a5', bg: 'rgba(240,82,82,0.07)', border: 'rgba(240,82,82,0.15)' },
}

function ScoreBubble({ score }) {
  const color = score >= 65 ? '#22d37a' : score >= 45 ? '#f59e0b' : '#f05252'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 36, borderRadius: '50%',
      background: `${color}18`, border: `1.5px solid ${color}55`,
      fontSize: 12, fontWeight: 800, color,
    }}>
      {score}
    </div>
  )
}

function FilterInput({ label, value, onChange, placeholder, type = 'number', min }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        min={min}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--surface3)',
          border: '1px solid var(--border-hi)',
          color: 'var(--text)',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 13,
          width: 90,
          fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

export default function FundamentalScreener({ onSelectTicker }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Filters
  const [minPe, setMinPe] = useState('')
  const [maxPe, setMaxPe] = useState('')
  const [minRoe, setMinRoe] = useState('')
  const [profitableOnly, setProfitableOnly] = useState(false)

  const buildQuery = () => {
    const params = new URLSearchParams()
    if (minPe !== '')    params.set('min_pe', minPe)
    if (maxPe !== '')    params.set('max_pe', maxPe)
    if (minRoe !== '')   params.set('min_roe', minRoe)
    if (profitableOnly)  params.set('profitable_only', 'true')
    params.set('limit', '30')
    return params.toString()
  }

  const load = () => {
    setLoading(true)
    setError(null)
    const query = buildQuery()
    api.get(`/fundamental/screener${query ? '?' + query : ''}`)
      .then(d => setResults(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  // Load on mount
  useEffect(() => { load() }, [])

  const handleReset = () => {
    setMinPe('')
    setMaxPe('')
    setMinRoe('')
    setProfitableOnly(false)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Filters panel */}
      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 22px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
          Screener Filters
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FilterInput label="Min PE" value={minPe} onChange={setMinPe} placeholder="e.g. 5" min="0" />
          <FilterInput label="Max PE" value={maxPe} onChange={setMaxPe} placeholder="e.g. 25" min="0" />
          <FilterInput label="Min ROE %" value={minRoe} onChange={setMinRoe} placeholder="e.g. 10" min="0" />

          {/* Profitable only toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Profitable Only
            </label>
            <button
              onClick={() => setProfitableOnly(v => !v)}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                border: `1px solid ${profitableOnly ? 'rgba(34,211,122,0.4)' : 'var(--border-hi)'}`,
                background: profitableOnly ? 'rgba(34,211,122,0.1)' : 'var(--surface3)',
                color: profitableOnly ? 'var(--bull)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {profitableOnly ? '✓ Yes' : 'Any'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                background: 'var(--gradient-accent)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              {loading ? 'Scanning…' : 'Run Screener'}
            </button>
            <button
              onClick={handleReset}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                background: 'var(--surface3)',
                border: '1px solid var(--border-hi)',
                color: 'var(--muted)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--bear)', marginBottom: 14, padding: '10px 16px', background: 'var(--bear-dim)', borderRadius: 6, border: '1px solid rgba(240,82,82,0.25)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        {loading ? 'Scanning 50-stock universe…' : `${results.length} results`}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Fetching fundamentals for up to 50 stocks…
        </div>
      ) : (
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 80px 80px 80px 80px 100px',
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface3)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}>
            <div>Ticker</div>
            <div>Market Cap</div>
            <div>P/E</div>
            <div>ROE</div>
            <div>Growth</div>
            <div>Quality</div>
            <div>Verdict</div>
          </div>

          {results.length === 0 && !loading && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No results match the current filters.
            </div>
          )}

          {results.map((row, i) => {
            const vstyle = VERDICT_STYLE[row.verdict] || VERDICT_STYLE['Neutral']
            return (
              <div
                key={row.ticker}
                onClick={() => onSelectTicker && onSelectTicker(row.ticker)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 80px 80px 80px 80px 100px',
                  gap: 8,
                  padding: '12px 16px',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                  alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Ticker */}
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent-hi)' }}>
                  {row.ticker}
                </div>

                {/* Market cap */}
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {fmtMarketCap(row.market_cap)}
                </div>

                {/* PE */}
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: row.pe_ratio == null ? 'var(--muted)'
                    : row.pe_ratio < 15 ? 'var(--bull)'
                    : row.pe_ratio < 25 ? 'var(--gold)'
                    : 'var(--bear)',
                }}>
                  {row.pe_ratio != null ? row.pe_ratio.toFixed(1) : '—'}
                </div>

                {/* ROE */}
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: row.roe == null ? 'var(--muted)'
                    : row.roe >= 15 ? 'var(--bull)'
                    : row.roe >= 8 ? 'var(--gold)'
                    : 'var(--bear)',
                }}>
                  {row.roe != null ? `${row.roe.toFixed(1)}%` : '—'}
                </div>

                {/* Growth score */}
                <ScoreBubble score={row.growth_score ?? 50} />

                {/* Quality score */}
                <ScoreBubble score={row.quality_score ?? 50} />

                {/* Verdict */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700,
                  background: vstyle.bg,
                  color: vstyle.color,
                  border: `1px solid ${vstyle.border}`,
                  whiteSpace: 'nowrap',
                }}>
                  {row.verdict}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        50-stock universe · Click any row to view full valuation · Cached 30 min · Not financial advice
      </div>
    </div>
  )
}
