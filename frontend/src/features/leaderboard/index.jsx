import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(v, d = 1) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(d) : v
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function pctColor(v) {
  if (v == null) return 'var(--muted)'
  return v > 0 ? 'var(--bull)' : v < 0 ? 'var(--bear)' : 'var(--muted)'
}

const FEATURE_META = {
  options:       { label: 'Options Flow',  icon: '📊', color: '#38bdf8' },
  technical:     { label: 'Technical',     icon: '📈', color: '#a78bfa' },
  insider:       { label: 'Insider',       icon: '🔑', color: '#fbbf24' },
  institutional: { label: 'Institutional', icon: '🏦', color: '#4ade80' },
}

const FEATURE_ORDER = ['options', 'technical', 'insider', 'institutional']
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣']

// ── FeatureCard ───────────────────────────────────────────────────────────────

function FeatureCard({ data, rank }) {
  const meta = FEATURE_META[data.feature] || { label: data.feature, icon: '?', color: 'var(--accent)' }
  const wr = data.win_rate_pct
  const wrColor = wr == null ? 'var(--muted)' : wr >= 55 ? 'var(--bull)' : wr >= 45 ? 'var(--accent)' : 'var(--bear)'
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: 'var(--surface)', border: `1px solid ${meta.color}44`,
      borderRadius: 12, padding: '16px 18px', position: 'relative',
    }}>
      {rank != null && (
        <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 18 }}>
          {MEDALS[rank] ?? ''}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: wrColor, marginBottom: 4 }}>
        {wr != null ? `${wr}%` : '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>win rate</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
        <span>{data.evaluated ?? 0} evaluated</span>
        <span>{data.pending ?? 0} pending</span>
      </div>
      {(data.bull_win_rate != null || data.bear_win_rate != null) && (
        <div style={{ display: 'flex', gap: 12, fontSize: 11, marginTop: 6 }}>
          <span style={{ color: 'var(--bull)' }}>▲ {fmtPct(data.bull_win_rate)}</span>
          <span style={{ color: 'var(--bear)' }}>▼ {fmtPct(data.bear_win_rate)}</span>
        </div>
      )}
      {data.avg_return != null && (
        <div style={{ fontSize: 11, marginTop: 4, color: pctColor(data.avg_return) }}>
          avg {data.avg_return > 0 ? '+' : ''}{fmt(data.avg_return)}% directional
        </div>
      )}
    </div>
  )
}

// ── ResultsTab ────────────────────────────────────────────────────────────────

function ResultsTab({ summary, timeframe }) {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [selFeature, setSelFeature] = useState('options')

  useEffect(() => {
    setLoading(true)
    api.get('/leaderboard/picks', { params: { timeframe, evaluated_only: true, limit: 50 } })
      .then(r => setResults(r.data.picks || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [timeframe])

  const features = summary?.features ?? []
  // Sort by win rate descending (nulls last)
  const ranked = [...features].sort((a, b) => {
    const aw = a.win_rate_pct ?? -1
    const bw = b.win_rate_pct ?? -1
    return bw - aw
  })

  const picks = results[selFeature] || {}
  const allPicks = [...(picks.bullish || []), ...(picks.bearish || [])]
    .sort((a, b) => {
      const ar = (a.return_pct ?? 0) * (a.direction ?? 0)
      const br = (b.return_pct ?? 0) * (b.direction ?? 0)
      return br - ar
    })

  const thStyle = {
    padding: '8px 10px', fontSize: 11, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '.5px',
    textAlign: 'left', borderBottom: '1px solid var(--border)',
    background: 'var(--surface2)',
  }

  const noEval = features.every(f => !f.evaluated)

  return (
    <div style={{ padding: 0 }}>
      {/* Standings */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Current Standings — {timeframe === '1w' ? 'Weekly' : 'Monthly'}
        </div>

        {noEval ? (
          <div style={{
            padding: '14px 16px', background: '#fbbf2415', border: '1px solid #fbbf2440',
            borderRadius: 8, fontSize: 12, color: '#fbbf24', marginBottom: 16,
          }}>
            ⚠️ No evaluated predictions yet. Run a scan and wait for the evaluation window (7d weekly / 30d monthly),
            or use <strong>Force Evaluate All</strong> in the Backtest tab to grade immediately at current prices.
            Note: force-evaluate during market close shows 0% return (entry = exit price).
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {ranked.map((f, i) => (
            <FeatureCard key={f.feature} data={f} rank={i} />
          ))}
        </div>
      </div>

      {/* Detailed results per feature */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Evaluated Picks</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {FEATURE_ORDER.map(f => {
              const meta = FEATURE_META[f]
              const evalCount = (results[f]?.bullish?.length ?? 0) + (results[f]?.bearish?.length ?? 0)
              return (
                <button key={f} onClick={() => setSelFeature(f)} style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: selFeature === f ? `${meta.color}33` : 'var(--surface2)',
                  color: selFeature === f ? meta.color : 'var(--muted)',
                }}>
                  {meta.icon} {meta.label}
                  {evalCount > 0 && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.8 }}>({evalCount})</span>}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
        ) : allPicks.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No evaluated picks for {FEATURE_META[selFeature]?.label ?? selFeature} on {timeframe === '1w' ? 'weekly' : 'monthly'} timeframe yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Ticker</th>
                  <th style={thStyle}>Direction</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Entry $</th>
                  <th style={thStyle}>Exit $</th>
                  <th style={thStyle}>Return %</th>
                  <th style={thStyle}>Directional</th>
                  <th style={thStyle}>Result</th>
                </tr>
              </thead>
              <tbody>
                {allPicks.map((p, i) => {
                  const dir = p.direction ?? 0
                  const ret = p.return_pct
                  const retDir = ret != null ? ret * dir : null
                  const dirColor = dir === 1 ? 'var(--bull)' : dir === -1 ? 'var(--bear)' : 'var(--muted)'
                  return (
                    <tr key={`${p.ticker}-${i}`} style={{
                      borderBottom: '1px solid var(--border)',
                      background: p.correct === 1 ? '#4ade8008' : p.correct === 0 ? '#f8717108' : 'transparent',
                    }}>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 11 }}>#{i + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text)' }}>{p.ticker}</td>
                      <td style={{ padding: '8px 10px', color: dirColor, fontWeight: 600 }}>
                        {dir === 1 ? '▲ Bull' : dir === -1 ? '▼ Bear' : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--accent)' }}>{fmt(p.score, 2)}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>
                        {p.spot_entry ? `$${fmt(p.spot_entry, 2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>
                        {p.spot_exit ? `$${fmt(p.spot_exit, 2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: pctColor(ret), fontWeight: 600 }}>
                        {ret != null ? `${ret >= 0 ? '+' : ''}${fmt(ret)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: pctColor(retDir), fontWeight: 700 }}>
                        {retDir != null ? `${retDir > 0 ? '+' : ''}${fmt(retDir)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {p.correct === 1
                          ? <span style={{ color: 'var(--bull)', fontWeight: 700 }}>✓ Correct</span>
                          : p.correct === 0
                          ? <span style={{ color: 'var(--bear)', fontWeight: 700 }}>✗ Wrong</span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary stats per feature */}
      {!noEval && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Head-to-Head Accuracy
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Feature</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Picks</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Evaluated</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Win Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bull Win%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bear Win%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Avg Return</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((f, i) => {
                  const meta = FEATURE_META[f.feature] || { label: f.feature, color: 'var(--accent)' }
                  const wr = f.win_rate_pct
                  const wrColor = wr == null ? 'var(--muted)' : wr >= 55 ? 'var(--bull)' : wr >= 45 ? 'var(--accent)' : 'var(--bear)'
                  return (
                    <tr key={f.feature} style={{
                      borderBottom: '1px solid var(--border)',
                      background: i === 0 ? '#4ade8008' : 'transparent',
                    }}>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ marginRight: 6 }}>{MEDALS[i] ?? ''}</span>
                        <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--muted)' }}>{f.total}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--muted)' }}>{f.evaluated}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: wrColor }}>
                        {fmtPct(wr)}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--bull)' }}>
                        {fmtPct(f.bull_win_rate)}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--bear)' }}>
                        {fmtPct(f.bear_win_rate)}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: pctColor(f.avg_return) }}>
                        {f.avg_return != null ? `${f.avg_return > 0 ? '+' : ''}${fmt(f.avg_return)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DirectionCell / ConsensusCell ─────────────────────────────────────────────

function DirectionCell({ pick }) {
  if (!pick) return <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>—</td>
  const dir = pick.direction
  const dirColor = dir === 1 ? 'var(--bull)' : dir === -1 ? 'var(--bear)' : 'var(--muted)'
  const ret = pick.return_pct
  return (
    <td style={{ textAlign: 'center', padding: '8px 6px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: dirColor }}>
        {dir === 1 ? '▲' : dir === -1 ? '▼' : '—'}
      </div>
      {pick.evaluated ? (
        <div style={{ fontSize: 11, color: pctColor(ret != null ? ret * dir : null) }}>
          {ret != null ? `${ret > 0 ? '+' : ''}${fmt(ret)}%` : '?'}
          {pick.correct === 1 ? ' ✓' : pick.correct === 0 ? ' ✗' : ''}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>pending</div>
      )}
    </td>
  )
}

function ConsensusCell({ row }) {
  const count = row.consensus_count
  const dir = row.consensus_direction
  const color = dir === 1 ? 'var(--bull)' : dir === -1 ? 'var(--bear)' : 'var(--muted)'
  const label = dir === 1 ? '▲ Bull' : dir === -1 ? '▼ Bear' : 'Split'
  const strength = count >= 4 ? 'Strong' : count === 3 ? 'Good' : 'Weak'
  return (
    <td style={{ textAlign: 'center', padding: '8px 6px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{strength} ({count}/4)</div>
      {row.avg_directional_return != null && (
        <div style={{ fontSize: 11, color: pctColor(row.avg_directional_return) }}>
          {row.avg_directional_return > 0 ? '+' : ''}{fmt(row.avg_directional_return)}%
        </div>
      )}
    </td>
  )
}

// ── ComparisonGrid ────────────────────────────────────────────────────────────

function ComparisonGrid({ rows, loading }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
  if (!rows?.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      No picks yet. Run a scan to populate the comparison grid.
    </div>
  )
  const thStyle = { padding: '10px 8px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface2)' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 12 }}>Ticker</th>
            {FEATURE_ORDER.map(f => (
              <th key={f} style={thStyle}>{FEATURE_META[f].icon} {FEATURE_META[f].label}</th>
            ))}
            <th style={{ ...thStyle, color: 'var(--accent)' }}>Consensus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ticker} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 14 }}>
                <div style={{ color: 'var(--text)' }}>{row.ticker}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.bull_count}↑ {row.bear_count}↓</div>
              </td>
              {FEATURE_ORDER.map(f => <DirectionCell key={f} pick={row.features?.[f]} />)}
              <ConsensusCell row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── PicksList ─────────────────────────────────────────────────────────────────

function PicksList({ picks, direction }) {
  const all = direction === 1
    ? FEATURE_ORDER.flatMap(f => (picks[f]?.bullish || []).map(p => ({ ...p, feature: f })))
    : FEATURE_ORDER.flatMap(f => (picks[f]?.bearish || []).map(p => ({ ...p, feature: f })))

  if (!all.length) return (
    <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>
      No picks logged yet. Run a scan first.
    </div>
  )
  const thStyle = { padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={thStyle}>Ticker</th>
            <th style={thStyle}>Feature</th>
            <th style={thStyle}>Score</th>
            <th style={thStyle}>Entry $</th>
            <th style={thStyle}>Exit $</th>
            <th style={thStyle}>Return</th>
            <th style={thStyle}>Result</th>
          </tr>
        </thead>
        <tbody>
          {all.map((p, i) => {
            const meta = FEATURE_META[p.feature] || { label: p.feature, color: 'var(--accent)' }
            const dir = direction
            const ret = p.return_pct
            const retDir = ret != null ? ret * dir : null
            return (
              <tr key={`${p.feature}-${p.ticker}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: dir === 1 ? 'var(--bull)' : 'var(--bear)' }}>
                  {dir === 1 ? '▲' : '▼'} {p.ticker}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}22`, padding: '2px 7px', borderRadius: 4 }}>
                    {meta.label}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--accent)' }}>{fmt(p.score, 2)}</td>
                <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{p.spot_entry ? `$${fmt(p.spot_entry, 2)}` : '—'}</td>
                <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{p.spot_exit ? `$${fmt(p.spot_exit, 2)}` : '—'}</td>
                <td style={{ padding: '8px 10px', color: pctColor(retDir), fontWeight: 600 }}>
                  {ret != null ? `${retDir > 0 ? '+' : ''}${fmt(retDir)}%` : '—'}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {!p.evaluated ? <span style={{ color: 'var(--muted)' }}>Pending</span>
                    : p.correct === 1 ? <span style={{ color: 'var(--bull)' }}>✓</span>
                    : p.correct === 0 ? <span style={{ color: 'var(--bear)' }}>✗</span>
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LeaderboardFeature() {
  const [tab, setTab] = useState('results')
  const [timeframe, setTimeframe] = useState('1w')
  const [pickDir, setPickDir] = useState(1)
  const [summary, setSummary] = useState(null)
  const [picks, setPicks] = useState({})
  const [comparison, setComparison] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState(null)
  const [lastScan, setLastScan] = useState(null)

  const loadSummary = useCallback(() => {
    api.get('/leaderboard/summary').then(r => setSummary(r.data)).catch(() => {})
  }, [])

  const loadPicks = useCallback(() => {
    setLoading(true)
    api.get('/leaderboard/picks', { params: { timeframe } })
      .then(r => setPicks(r.data.picks || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [timeframe])

  const loadComparison = useCallback(() => {
    setLoading(true)
    api.get('/leaderboard/comparison', { params: { timeframe, min_consensus: 2 } })
      .then(r => setComparison(r.data.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [timeframe])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => {
    if (tab === 'comparison') loadComparison()
    else if (tab === 'picks') loadPicks()
    else loadSummary()
  }, [tab, timeframe])

  const runScan = async (tf) => {
    setScanning(true)
    setScanMsg(null)
    try {
      await api.post('/leaderboard/scan', null, { params: { timeframe: tf } })
      setScanMsg(`✓ ${tf} scan started — picks will appear in ~60s.`)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) {
      setScanMsg(`Error: ${e.message}`)
    } finally {
      setScanning(false)
      setTimeout(() => { loadSummary(); loadComparison(); loadPicks() }, 5000)
    }
  }

  const btn = (active, onClick, children) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: active ? 'var(--accent)' : 'var(--surface2)',
      color: active ? '#000' : 'var(--muted)',
    }}>{children}</button>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🏆 Signal Leaderboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Compare weekly &amp; monthly Top-20 picks across Options, Technical, Insider, and Institutional signals
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {btn(tab === 'results',    () => setTab('results'),    '🏆 Results')}
          {btn(tab === 'comparison', () => setTab('comparison'), '⚖️ Comparison')}
          {btn(tab === 'picks',      () => setTab('picks'),      '📋 All Picks')}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {btn(timeframe === '1w',  () => setTimeframe('1w'),  'Weekly')}
          {btn(timeframe === '1mo', () => setTimeframe('1mo'), 'Monthly')}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastScan && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last: {lastScan}</span>}
          <button onClick={() => runScan('weekly')} disabled={scanning} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--accent)', fontWeight: 600, fontSize: 12,
            cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
          }}>
            {scanning ? '⏳ Scanning…' : '▶ Weekly Scan'}
          </button>
          <button onClick={() => runScan('monthly')} disabled={scanning} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--muted)', fontWeight: 600, fontSize: 12,
            cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
          }}>
            ▶ Monthly
          </button>
        </div>
      </div>

      {scanMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: scanMsg.startsWith('✓') ? 'var(--bull)' : 'var(--bear)' }}>
          {scanMsg}
        </div>
      )}

      {/* Main panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {tab === 'results' && (
          <ResultsTab summary={summary} timeframe={timeframe} />
        )}

        {tab === 'comparison' && (
          <>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                Cross-Feature Comparison — {timeframe === '1w' ? 'Weekly' : 'Monthly'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>≥2 features agree · sorted by consensus</span>
            </div>
            <ComparisonGrid rows={comparison} loading={loading} />
          </>
        )}

        {tab === 'picks' && (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              {btn(pickDir === 1,  () => setPickDir(1),  '▲ Bullish Picks')}
              {btn(pickDir === -1, () => setPickDir(-1), '▼ Bearish Picks')}
            </div>
            <PicksList picks={picks} direction={pickDir} />
          </>
        )}
      </div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>How it works</summary>
        <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
          <p><strong style={{ color: 'var(--text)' }}>Weekly Scan</strong> — Every Monday at 6am UTC, each feature scanner picks its Top-20 bullish/bearish. Predictions grade after 7 days against actual price.</p>
          <p><strong style={{ color: 'var(--text)' }}>Monthly Scan</strong> — 1st of every month, 30-day evaluation window.</p>
          <p><strong style={{ color: 'var(--text)' }}>Results tab</strong> — Shows current standings ranked by win rate, with medal rankings and per-pick detail.</p>
          <p><strong style={{ color: 'var(--text)' }}>Force Evaluate</strong> — In the Backtest tab, hit "Force Evaluate All" to grade picks at today's price instantly. Note: 0% return is expected if evaluated same day as scan (market close = entry price).</p>
        </div>
      </details>
    </div>
  )
}
