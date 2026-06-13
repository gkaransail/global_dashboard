import { useState, useEffect } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

function fmtMarketCap(val) {
  if (val == null) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(2)}M`
  return `$${val.toLocaleString()}`
}

function peLabel(pe) {
  if (pe == null) return { label: 'N/A', color: 'var(--muted)' }
  if (pe < 15)   return { label: 'Undervalued', color: 'var(--bull)' }
  if (pe <= 25)  return { label: 'Fair Value',  color: 'var(--gold)' }
  return             { label: 'Premium',       color: 'var(--bear)' }
}

function pbLabel(pb) {
  if (pb == null) return { label: 'N/A', color: 'var(--muted)' }
  if (pb < 1)    return { label: 'Below Book',  color: 'var(--bull)' }
  if (pb <= 3)   return { label: 'Reasonable',  color: 'var(--gold)' }
  return             { label: 'Premium',        color: 'var(--bear)' }
}

function psLabel(ps) {
  if (ps == null) return { label: 'N/A', color: 'var(--muted)' }
  if (ps < 2)    return { label: 'Cheap',  color: 'var(--bull)' }
  if (ps <= 5)   return { label: 'Fair',   color: 'var(--gold)' }
  return             { label: 'Expensive', color: 'var(--bear)' }
}

function evLabel(ev) {
  if (ev == null) return { label: 'N/A', color: 'var(--muted)' }
  if (ev < 10)   return { label: 'Attractive', color: 'var(--bull)' }
  if (ev <= 20)  return { label: 'Fair',       color: 'var(--gold)' }
  return             { label: 'Expensive',    color: 'var(--bear)' }
}

function MetricCard({ label, value, qualifier, hint }) {
  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 4 }}>
        {value ?? '—'}
      </div>
      {qualifier && (
        <div style={{ fontSize: 11, fontWeight: 700, color: qualifier.color, marginBottom: 2 }}>
          {qualifier.label}
        </div>
      )}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

export default function ValuationView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    api.get(`/fundamental/valuation/${ticker}`)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [ticker])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading valuation data…</div>
  if (error)   return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--bear)' }}>
      ⚠️ {error}
      <br />
      <button
        onClick={load}
        style={{ marginTop: 12, padding: '8px 20px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Retry
      </button>
    </div>
  )
  if (!data) return null

  const grahamDiff = data.graham_vs_price_pct
  const grahamColor = grahamDiff == null ? 'var(--muted)' : grahamDiff < 0 ? 'var(--bull)' : 'var(--bear)'
  const grahamLabel = grahamDiff == null ? '—'
    : `${Math.abs(grahamDiff).toFixed(1)}% ${grahamDiff >= 0 ? 'above' : 'below'} Graham Number`

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header card */}
      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            {data.name || data.ticker}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {data.ticker}
            {data.sector && <span> · {data.sector}</span>}
            {data.industry && <span style={{ color: 'var(--muted)' }}> · {data.industry}</span>}
          </div>
          {data.description && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12, lineHeight: 1.65, maxWidth: 560 }}>
              {data.description.slice(0, 200)}{data.description.length > 200 ? '…' : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {data.current_price != null && (
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>
              ${data.current_price.toLocaleString()}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Mkt Cap: <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{fmtMarketCap(data.market_cap)}</span>
          </div>
          {data.enterprise_value != null && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              EV: <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{fmtMarketCap(data.enterprise_value)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Valuation ratios grid */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Valuation Ratios
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 24 }}>
        <MetricCard
          label="P/E Ratio"
          value={data.pe_ratio != null ? data.pe_ratio.toFixed(1) : null}
          qualifier={peLabel(data.pe_ratio)}
          hint="Price / Trailing 12mo EPS"
        />
        <MetricCard
          label="P/B Ratio"
          value={data.pb_ratio != null ? data.pb_ratio.toFixed(2) : null}
          qualifier={pbLabel(data.pb_ratio)}
          hint="Price / Book Value per Share"
        />
        <MetricCard
          label="P/S Ratio"
          value={data.ps_ratio != null ? data.ps_ratio.toFixed(2) : null}
          qualifier={psLabel(data.ps_ratio)}
          hint="Price / Trailing 12mo Revenue"
        />
        <MetricCard
          label="EV / EBITDA"
          value={data.ev_ebitda != null ? data.ev_ebitda.toFixed(1) : null}
          qualifier={evLabel(data.ev_ebitda)}
          hint="Enterprise Value / EBITDA"
        />
      </div>

      {/* Graham Number */}
      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>
            Graham Number
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            {data.graham_number != null ? `$${data.graham_number.toFixed(2)}` : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: grahamColor }}>
            Price vs Graham: {grahamLabel}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Graham Number = √(22.5 × EPS × Book Value/Share) — conservative intrinsic value floor
          </div>
        </div>
      </div>

      {/* DCF Estimate */}
      {(data.dcf_estimate != null) && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.03) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hi)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
              5-Year Simple DCF Estimate
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, background: 'var(--accent-dim)',
              color: 'var(--accent-hi)', border: '1px solid rgba(99,102,241,.2)',
              borderRadius: 20, padding: '1px 7px', textTransform: 'uppercase',
            }}>Rough Estimate</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}>
              ${data.dcf_estimate.toLocaleString()}
            </div>
            {data.dcf_range_low != null && data.dcf_range_high != null && (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Range: ${data.dcf_range_low.toLocaleString()} – ${data.dcf_range_high.toLocaleString()} (±20%)
              </div>
            )}
            {data.current_price != null && data.dcf_estimate != null && (
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: data.current_price < data.dcf_estimate ? 'var(--bull)' : 'var(--bear)',
              }}>
                {data.current_price < data.dcf_estimate
                  ? `${(((data.dcf_estimate - data.current_price) / data.current_price) * 100).toFixed(0)}% upside`
                  : `${(((data.current_price - data.dcf_estimate) / data.dcf_estimate) * 100).toFixed(0)}% above DCF`}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
            {data.dcf_note}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        Data via yfinance · Cached 1 hr · Not financial advice
      </div>
    </div>
  )
}
