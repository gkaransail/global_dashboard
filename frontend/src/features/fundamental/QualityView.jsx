import { useState, useEffect } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

function ReturnCard({ label, value, goodThresh = 15, okThresh = 5, hint }) {
  const color = value == null ? 'var(--muted)'
    : value >= goodThresh ? 'var(--bull)'
    : value >= okThresh   ? 'var(--gold)'
    : 'var(--bear)'

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.5px' }}>
        {value != null ? `${value.toFixed(1)}%` : '—'}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function RatioRow({ label, value, fmt = (v) => v.toFixed(2), goodThresh, okThresh, lowerIsBetter = false, hint }) {
  let color = 'var(--text)'
  if (value != null && goodThresh != null) {
    if (lowerIsBetter) {
      color = value <= goodThresh ? 'var(--bull)' : value <= okThresh ? 'var(--gold)' : 'var(--bear)'
    } else {
      color = value >= goodThresh ? 'var(--bull)' : value >= okThresh ? 'var(--gold)' : 'var(--bear)'
    }
  }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 12,
      alignItems: 'center',
      padding: '11px 16px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color, textAlign: 'right' }}>
        {value != null ? fmt(value) : '—'}
      </div>
    </div>
  )
}

const PIOTROSKI_LABELS = {
  positive_net_income:      { label: 'Positive Net Income',       cat: 'Profitability' },
  positive_roa:             { label: 'Positive ROA',              cat: 'Profitability' },
  positive_ocf:             { label: 'Positive Operating CF',     cat: 'Profitability' },
  ocf_gt_net_income:        { label: 'Cash Flow > Net Income',    cat: 'Profitability' },
  decreasing_leverage:      { label: 'Decreasing Leverage',       cat: 'Leverage' },
  improving_current_ratio:  { label: 'Improving Current Ratio',   cat: 'Leverage' },
  no_share_dilution:        { label: 'No Share Dilution',         cat: 'Leverage' },
  improving_gross_margin:   { label: 'Improving Gross Margin',    cat: 'Efficiency' },
  improving_asset_turnover: { label: 'Improving Asset Turnover',  cat: 'Efficiency' },
}

export default function QualityView() {
  const ticker = useStore(s => s.ticker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    api.get(`/fundamental/quality/${ticker}`)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [ticker])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading quality data…</div>
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

  const qs = data.quality_score ?? 50

  // Altman Z badge
  const zBadge = {
    Safe: { bg: 'rgba(34,211,122,0.12)', border: 'rgba(34,211,122,0.3)', text: '#22d37a' },
    'Grey Zone': { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
    Distress: { bg: 'rgba(240,82,82,0.12)', border: 'rgba(240,82,82,0.3)', text: '#f05252' },
  }[data.altman_zone] || { bg: 'var(--surface3)', border: 'var(--border)', text: 'var(--muted)' }

  // Piotroski breakdown grouped by category
  const pioCats = { Profitability: [], Leverage: [], Efficiency: [] }
  Object.entries(data.piotroski_detail || {}).forEach(([key, passed]) => {
    const meta = PIOTROSKI_LABELS[key]
    if (meta) pioCats[meta.cat].push({ key, label: meta.label, passed })
  })

  const qsColor = qs >= 65 ? 'var(--bull)' : qs >= 40 ? 'var(--gold)' : 'var(--bear)'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Quality Score + Altman + Piotroski row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>

        {/* Quality score */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
          textAlign: 'center',
          minWidth: 140,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
            Quality Score
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: qsColor, letterSpacing: '-2px', lineHeight: 1 }}>
            {qs}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>/ 100 · {ticker}</div>
          <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 12 }}>
            <div style={{ width: `${qs}%`, height: 4, background: qsColor, borderRadius: 2, transition: 'width 0.6s' }} />
          </div>
        </div>

        {/* Altman Z-Score */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
            Altman Z-Score
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>
              {data.altman_z_score != null ? data.altman_z_score.toFixed(2) : '—'}
            </div>
            {data.altman_zone && (
              <div style={{
                background: zBadge.bg, border: `1px solid ${zBadge.border}`,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 12, fontWeight: 700, color: zBadge.text,
              }}>
                {data.altman_zone}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--bull)' }}>&gt;2.99</strong> Safe zone ·{' '}
            <strong style={{ color: 'var(--gold)' }}>1.81–2.99</strong> Grey zone ·{' '}
            <strong style={{ color: 'var(--bear)' }}>&lt;1.81</strong> Distress zone
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            5-factor bankruptcy prediction model
          </div>
        </div>

        {/* Piotroski F-Score */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
            Piotroski F-Score
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <div style={{
              fontSize: 32, fontWeight: 900, letterSpacing: '-1px',
              color: data.piotroski_f_score == null ? 'var(--muted)'
                : data.piotroski_f_score >= 7 ? 'var(--bull)'
                : data.piotroski_f_score >= 4 ? 'var(--gold)'
                : 'var(--bear)',
            }}>
              {data.piotroski_f_score ?? '—'}
            </div>
            <div style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 600 }}>/9</div>
          </div>
          {Object.entries(pioCats).map(([cat, tests]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                {cat}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tests.map(t => (
                  <span key={t.key} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: t.passed ? 'rgba(34,211,122,0.1)' : 'rgba(240,82,82,0.1)',
                    color: t.passed ? 'var(--bull)' : 'var(--bear)',
                    border: `1px solid ${t.passed ? 'rgba(34,211,122,0.25)' : 'rgba(240,82,82,0.25)'}`,
                  }}>
                    {t.passed ? '✓' : '✗'} {t.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Return metrics */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Return Metrics
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        <ReturnCard label="ROE" value={data.roe} hint="Return on Equity" goodThresh={15} okThresh={8} />
        <ReturnCard label="ROA" value={data.roa} hint="Return on Assets" goodThresh={10} okThresh={5} />
        <ReturnCard label="ROIC" value={data.roic} hint="Return on Invested Capital" goodThresh={12} okThresh={6} />
      </div>

      {/* Balance sheet ratios */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Balance Sheet & Liquidity
      </div>
      <div style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        <RatioRow
          label="Current Ratio"
          value={data.current_ratio}
          hint="Current assets / Current liabilities — >1.5 is healthy"
          goodThresh={1.5} okThresh={1.0}
        />
        <RatioRow
          label="Quick Ratio"
          value={data.quick_ratio}
          hint="(Current assets - Inventory) / Current liabilities"
          goodThresh={1.2} okThresh={0.8}
        />
        <RatioRow
          label="Debt / Equity"
          value={data.debt_to_equity}
          fmt={(v) => `${v.toFixed(0)}%`}
          hint="Total debt as % of equity — lower is safer"
          goodThresh={50} okThresh={100}
          lowerIsBetter
        />
        <div style={{ borderBottom: 'none' }}>
          <RatioRow
            label="Interest Coverage"
            value={data.interest_coverage}
            hint="EBIT / Interest expense — how many times interest is covered"
            goodThresh={5} okThresh={2}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        Data via yfinance · Cached 1 hr · Not financial advice
      </div>
    </div>
  )
}
