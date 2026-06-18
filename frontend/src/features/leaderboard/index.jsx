import { useState, useEffect, useCallback } from 'react'
import { api } from '../../core/api'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(v, d = 1) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(d) : v
}

function pctColor(v) {
  if (v == null) return 'var(--muted)'
  return v > 0 ? 'var(--bull)' : v < 0 ? 'var(--bear)' : 'var(--muted)'
}

const FEATURE_META = {
  options:       { label: 'Options Flow',    icon: '📊', color: '#38bdf8' },
  technical:     { label: 'Technical',       icon: '📈', color: '#a78bfa' },
  insider:       { label: 'Insider',         icon: '🔑', color: '#fbbf24' },
  institutional: { label: 'Institutional',   icon: '🏦', color: '#4ade80' },
}

const FEATURE_ORDER = ['options', 'technical', 'insider', 'institutional']

// ── sub-components ────────────────────────────────────────────────────────────

function FeatureCard({ data }) {
  const meta = FEATURE_META[data.feature] || { label: data.feature, icon: '?', color: 'var(--accent)' }
  const wr = data.win_rate_pct
  const wrColor = wr == null ? 'var(--muted)' : wr >= 55 ? 'var(--bull)' : wr >= 45 ? 'var(--accent)' : 'var(--bear)'
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: 'var(--surface)', border: `1px solid ${meta.color}44`,
      borderRadius: 12, padding: '16px 18px',
    }}>
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
          <span style={{ color: 'var(--bull)' }}>▲ {fmt(data.bull_win_rate)}%</span>
          <span style={{ color: 'var(--bear)' }}>▼ {fmt(data.bear_win_rate)}%</span>
        </div>
      )}
    </div>
  )
}

function DirectionCell({ pick }) {
  if (!pick) return <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>—</td>
  const dir = pick.direction
  const dirColor = dir === 1 ? 'var(--bull)' : dir === -1 ? 'var(--bear)' : 'var(--muted)'
  const dirLabel = dir === 1 ? '▲' : dir === -1 ? '▼' : '—'
  const ret = pick.return_pct
  return (
    <td style={{ textAlign: 'center', padding: '8px 6px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: dirColor }}>{dirLabel}</div>
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

function ComparisonGrid({ rows, loading }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading comparison…</div>
  if (!rows?.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      No picks yet. Run a scan to populate the comparison grid.
    </div>
  )
  const thStyle = { padding: '10px 8px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 12 }}>Ticker</th>
            {FEATURE_ORDER.map(f => (
              <th key={f} style={thStyle}>
                {FEATURE_META[f].icon} {FEATURE_META[f].label}
              </th>
            ))}
            <th style={{ ...thStyle, color: 'var(--accent)' }}>Consensus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ticker} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 14 }}>
                <div style={{ color: 'var(--text)' }}>{row.ticker}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {row.bull_count}↑ {row.bear_count}↓
                </div>
              </td>
              {FEATURE_ORDER.map(f => (
                <DirectionCell key={f} pick={row.features?.[f]} />
              ))}
              <ConsensusCell row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PicksList({ picks, direction }) {
  const all = direction === 1
    ? FEATURE_ORDER.flatMap(f => (picks[f]?.bullish || []).map(p => ({ ...p, feature: f })))
    : FEATURE_ORDER.flatMap(f => (picks[f]?.bearish || []).map(p => ({ ...p, feature: f })))

  if (!all.length) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>No picks logged yet for this timeframe.</div>

  const thStyle = { padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }
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
            const ret = p.return_pct
            const dirFactor = direction
            const retDir = ret != null ? ret * dirFactor : null
            return (
              <tr key={`${p.feature}-${p.ticker}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: direction === 1 ? 'var(--bull)' : 'var(--bear)' }}>
                  {direction === 1 ? '▲' : '▼'} {p.ticker}
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
                    : p.correct === 1 ? <span style={{ color: 'var(--bull)' }}>✓ Correct</span>
                    : p.correct === 0 ? <span style={{ color: 'var(--bear)' }}>✗ Wrong</span>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function LeaderboardFeature() {
  const [tab, setTab] = useState('comparison')
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
  }, [tab, timeframe, loadComparison, loadPicks])

  const runScan = async (tf) => {
    setScanning(true)
    setScanMsg(null)
    try {
      const r = await api.post('/leaderboard/scan', null, { params: { timeframe: tf } })
      const feats = r.data.features || {}
      const total = Object.values(feats).reduce((s, f) => s + (f.logged || 0), 0)
      setScanMsg(`✓ ${tf} scan started — ${total} picks queued. Refresh in ~60s.`)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) {
      setScanMsg(`Error: ${e.message}`)
    } finally {
      setScanning(false)
      setTimeout(() => { loadSummary(); loadComparison(); loadPicks() }, 3000)
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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
          🏆 Signal Leaderboard
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Weekly &amp; monthly Top-20 picks from each signal source — see which predicts best over time
        </p>
      </div>

      {/* Accuracy scoreboard */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {summary?.features
          ? summary.features.map(f => <FeatureCard key={f.feature} data={f} />)
          : FEATURE_ORDER.map(f => <FeatureCard key={f} data={{ feature: f, ...FEATURE_META[f] }} />)
        }
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {btn(tab === 'comparison', () => setTab('comparison'), '⚖️ Comparison Grid')}
          {btn(tab === 'picks',      () => setTab('picks'),      '📋 All Picks')}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {btn(timeframe === '1w',  () => setTimeframe('1w'),  'Weekly')}
          {btn(timeframe === '1mo', () => setTimeframe('1mo'), 'Monthly')}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastScan && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last scan: {lastScan}</span>}
          <button onClick={() => runScan('weekly')} disabled={scanning} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--accent)', fontWeight: 600, fontSize: 12,
            cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
          }}>
            {scanning ? '⏳ Scanning…' : '▶ Run Weekly Scan'}
          </button>
          <button onClick={() => runScan('monthly')} disabled={scanning} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--muted)', fontWeight: 600, fontSize: 12,
            cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
          }}>
            ▶ Monthly Scan
          </button>
        </div>
      </div>

      {/* Scan message */}
      {scanMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: scanMsg.startsWith('✓') ? 'var(--bull)' : 'var(--bear)' }}>
          {scanMsg}
        </div>
      )}

      {/* Main content */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {tab === 'comparison' && (
          <>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Cross-Feature Comparison — {timeframe === '1w' ? 'Weekly' : 'Monthly'} picks
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Tickers where ≥2 features agree shown — sorted by consensus strength
              </span>
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
            <PicksList picks={picks} direction={pickDir} loading={loading} />
          </>
        )}
      </div>

      {/* How it works */}
      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          How it works
        </summary>
        <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--surface)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
          <p><strong style={{ color: 'var(--text)' }}>Weekly Scan</strong> — Every Monday at 6am UTC each feature scanner generates its Top-20 bullish and bearish picks. These are logged as predictions evaluated after 7 days.</p>
          <p><strong style={{ color: 'var(--text)' }}>Monthly Scan</strong> — 1st of every month, same process with a 30-day evaluation window.</p>
          <p><strong style={{ color: 'var(--text)' }}>Comparison Grid</strong> — Shows tickers where at least 2 features agree on direction. Strong consensus (3-4 features) = higher confidence signal.</p>
          <p><strong style={{ color: 'var(--text)' }}>Scoring</strong> — Options: P/C ratio + IV rank + max pain (max ±5). Technical: count of bullish/bearish conditions met. Insider: net buy/sell value in $M. Institutional: avg position change % across top holders.</p>
          <p>Run a manual scan anytime using the buttons above. Results appear in the comparison grid after ~60 seconds.</p>
        </div>
      </details>
    </div>
  )
}
