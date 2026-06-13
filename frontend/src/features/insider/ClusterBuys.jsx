import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'
import { useStore } from '../../core/store'

function formatValue(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toLocaleString()}`
}

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.7 ? 'var(--bull)' : score >= 0.4 ? 'var(--gold)' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
      <div style={{
        flex: 1,
        height: '5px',
        background: 'var(--border)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '32px', textAlign: 'right' }}>
        {pct}
      </span>
    </div>
  )
}

function ClusterCard({ cluster, onTickerClick }) {
  const score = cluster.cluster_score || 0
  const strengthLabel = score >= 0.7 ? 'Strong Cluster' : score >= 0.4 ? 'Moderate Cluster' : 'Cluster Signal'
  const strengthColor = score >= 0.7 ? 'var(--bull)' : score >= 0.4 ? 'var(--gold)' : 'var(--accent-hi)'
  const strengthBg    = score >= 0.7 ? 'var(--bull-dim)' : score >= 0.4 ? 'var(--gold-dim)' : 'var(--accent-dim)'
  const strengthBorder = score >= 0.7
    ? 'rgba(34,211,122,.25)'
    : score >= 0.4
      ? 'rgba(245,158,11,.25)'
      : 'rgba(99,102,241,.25)'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        boxShadow: 'var(--shadow-sm)',
        backgroundImage: 'var(--gradient-card)',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <button
            onClick={() => onTickerClick(cluster.ticker)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent-hi)', letterSpacing: '-0.5px' }}>
              {cluster.ticker}
            </span>
            {cluster.price > 0 && (
              <>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  ${cluster.price.toFixed(2)}
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: cluster.change_pct >= 0 ? 'var(--bull)' : 'var(--bear)',
                }}>
                  {cluster.change_pct >= 0 ? '+' : ''}{cluster.change_pct}%
                </span>
              </>
            )}
          </button>
        </div>

        {/* Strength badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: '20px',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          background: strengthBg,
          color: strengthColor,
          border: `1px solid ${strengthBorder}`,
          flexShrink: 0,
        }}>
          {strengthLabel}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <StatPill label="Insiders" value={cluster.insider_count} />
        <StatPill label="Span"     value={cluster.span_days > 0 ? `${cluster.span_days}d` : '1d'} />
        <StatPill label="Total"    value={formatValue(cluster.total_value)} highlight />
        <StatPill label="Shares"   value={cluster.total_shares?.toLocaleString()} />
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
            Cluster Strength
          </span>
        </div>
        <ScoreBar score={score} />
      </div>

      {/* Individual transactions */}
      {cluster.transactions && cluster.transactions.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {cluster.transactions.map((tx, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--bull)', fontSize: '10px', flexShrink: 0 }}>●</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.insider_name}
              </span>
              {tx.title && (
                <span style={{ color: 'var(--muted)', fontSize: '11px', flexShrink: 0 }}>({tx.title})</span>
              )}
              <span style={{ color: 'var(--bull)', fontWeight: 700, flexShrink: 0 }}>
                {formatValue(tx.value)}
              </span>
              {tx.date && (
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{tx.date}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: highlight ? 'var(--bull)' : 'var(--text)' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      {[80, 60, 100, 70].map((w, i) => (
        <div key={i} style={{
          height: '14px',
          width: `${w}%`,
          background: 'var(--surface2)',
          borderRadius: '4px',
        }} />
      ))}
    </div>
  )
}

export default function ClusterBuys() {
  const setTicker = useStore(s => s.setTicker)

  const [minInsiders, setMinInsiders] = useState(2)
  const [days, setDays]               = useState(60)
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/insider/cluster?min_insiders=${minInsiders}&days=${days}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [minInsiders, days])

  useEffect(() => { load() }, [load])

  const handleTickerClick = (ticker) => {
    setTicker(ticker)
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Explainer header */}
      <div style={{
        marginBottom: '20px',
        padding: '14px 16px',
        background: 'rgba(99,102,241,.06)',
        border: '1px solid rgba(99,102,241,.15)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
          What is cluster buying?
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          When multiple insiders at the same company buy shares in open-market transactions within a short
          time window, it suggests strong collective conviction in the stock's prospects. Cluster buying
          is one of the strongest insider signals — executives and directors rarely coordinate purchases
          unless they believe in upside. Scores weight both the number of insiders and total dollar commitment.
        </div>
      </div>

      {/* Settings bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: '20px',
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
            Min. Insiders
          </span>
          <select
            value={minInsiders}
            onChange={e => setMinInsiders(Number(e.target.value))}
            style={{
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border-hi)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value={2}>2+ insiders</option>
            <option value={3}>3+ insiders</option>
            <option value={4}>4+ insiders</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
            Time Window
          </span>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border-hi)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>

        <button
          onClick={load}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            padding: '7px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: loading ? 'var(--surface2)' : 'var(--gradient-accent)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            boxShadow: loading ? 'none' : 'var(--shadow-glow)',
          }}
        >
          {loading ? '⟳ Scanning…' : '↻ Scan'}
        </button>

        {data && !loading && (
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {data.clusters_found} clusters found in {data.scanned} stocks
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-box" style={{ marginBottom: '16px' }}>
          ⚠ {error}{' '}
          <button
            onClick={load}
            style={{ background: 'none', border: 'none', color: 'var(--bear)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <>
          {data.results && data.results.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
              {data.results.map(cluster => (
                <ClusterCard
                  key={cluster.ticker}
                  cluster={cluster}
                  onTickerClick={handleTickerClick}
                />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--muted)',
            }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎯</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '8px' }}>
                No clusters found
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                No stocks in the universe had {minInsiders}+ insiders buying within the last {days} days.
                Try lowering the minimum insiders threshold or extending the time window.
              </div>
            </div>
          )}

          {/* Footer */}
          {data.last_updated && (
            <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>
              Last updated {new Date(data.last_updated).toLocaleTimeString()} · Cached for 2 hours
            </div>
          )}
        </>
      )}
    </div>
  )
}
