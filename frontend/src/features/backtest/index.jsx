import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { api } from '../../core/api'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(v, decimals = 1) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(decimals) : v
}

function pctColor(v) {
  if (v == null) return 'var(--muted)'
  return v > 0 ? 'var(--bull)' : v < 0 ? 'var(--bear)' : 'var(--muted)'
}

function dirLabel(d) {
  return d === 1 ? { txt: '▲ Bull', color: 'var(--bull)' }
       : d === -1 ? { txt: '▼ Bear', color: 'var(--bear)' }
       : { txt: '— Neutral', color: 'var(--muted)' }
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', minWidth: 130 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function WeightBar({ signal, weight, base, accuracy, samples }) {
  const drift  = weight - base
  const pct    = Math.min((weight / 5) * 100, 100)
  const color  = drift > 0.1 ? 'var(--bull)' : drift < -0.1 ? 'var(--bear)' : 'var(--accent)'
  const accPct = accuracy != null ? Math.round(accuracy * 100) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 150, fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{signal}</div>
      <div style={{ flex: 1, height: 7, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .4s' }} />
      </div>
      <div style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 700, color }}>{fmt(weight, 2)}</div>
      <div style={{ width: 52, textAlign: 'right', fontSize: 11, color: drift > 0 ? 'var(--bull)' : drift < 0 ? 'var(--bear)' : 'var(--muted)' }}>
        {drift > 0 ? '+' : ''}{fmt(drift, 2)}
      </div>
      <div style={{ width: 60, textAlign: 'right', fontSize: 11, color: accPct >= 60 ? 'var(--bull)' : accPct != null && accPct < 45 ? 'var(--bear)' : 'var(--muted)' }}>
        {accPct != null ? `${accPct}% (${samples})` : '—'}
      </div>
    </div>
  )
}

function PredRow({ p }) {
  const dir     = dirLabel(p.direction)
  const retPct  = p.actual_return_pct
  const correct = p.correct

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{p.ticker}</td>
      <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{p.timeframe}</td>
      <td style={{ padding: '7px 10px', color: dir.color, fontWeight: 600 }}>{dir.txt}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right', color: (p.score ?? 0) > 0 ? 'var(--bull)' : (p.score ?? 0) < 0 ? 'var(--bear)' : 'var(--muted)', fontWeight: 700 }}>
        {p.score != null ? (p.score > 0 ? `+${p.score}` : p.score) : '—'}
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>${fmt(p.spot_at_prediction, 2)}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right', color: retPct != null ? pctColor(retPct) : 'var(--muted)', fontWeight: retPct != null ? 700 : 400 }}>
        {retPct != null ? `${retPct > 0 ? '+' : ''}${fmt(retPct, 2)}%` : '—'}
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
        {correct == null ? '⏳' : correct ? '✅' : '❌'}
      </td>
      <td style={{ padding: '7px 10px', color: 'var(--muted)', fontSize: 10 }}>
        {p.predicted_at ? p.predicted_at.slice(0, 10) : '—'}
      </td>
    </tr>
  )
}

function PendingRow({ p }) {
  const dir = dirLabel(p.direction)
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{p.ticker}</td>
      <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{p.timeframe}</td>
      <td style={{ padding: '7px 10px', color: dir.color, fontWeight: 600 }}>{dir.txt}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right', color: (p.score ?? 0) > 0 ? 'var(--bull)' : (p.score ?? 0) < 0 ? 'var(--bear)' : 'var(--muted)', fontWeight: 700 }}>
        {p.score != null ? (p.score > 0 ? `+${p.score}` : p.score) : '—'}
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>${fmt(p.spot_at_prediction, 2)}</td>
      <td style={{ padding: '7px 10px', color: 'var(--muted)', fontSize: 10 }}>{p.evaluate_after}</td>
    </tr>
  )
}

// ── main component ────────────────────────────────────────────────────────────

function BacktestDashboard() {
  const [stats,    setStats]    = useState(null)
  const [weights,  setWeights]  = useState([])
  const [preds,    setPreds]    = useState([])
  const [pending,  setPending]  = useState([])
  const [tab,      setTab]      = useState('evaluated')
  const [loading,  setLoading]  = useState(false)
  const [running,  setRunning]  = useState(false)
  const [msg,      setMsg]      = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [s, w, p, pnd] = await Promise.all([
        api.get('/backtest/stats'),
        api.get('/backtest/weights'),
        api.get('/backtest/predictions?limit=200'),
        api.get('/backtest/pending'),
      ])
      setStats(s)
      setWeights(w.weights || [])
      setPreds(p.predictions || [])
      setPending(pnd.pending || [])
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }

  async function runEvaluate() {
    setRunning(true); setMsg(null)
    try {
      const r = await api.post('/backtest/evaluate', {})
      setMsg({ type: 'ok', text: `Evaluated ${r.evaluated} predictions. ${r.errors} errors.` })
      await loadAll()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRunning(false) }
  }

  async function runTrain() {
    setRunning(true); setMsg(null)
    try {
      const r = await api.post('/backtest/train', {})
      setMsg({ type: 'ok', text: `RL update complete. ${r.signals_updated} signals adjusted across ${r.total_predictions_processed} predictions.` })
      await loadAll()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRunning(false) }
  }

  async function resetWeights() {
    if (!confirm('Reset all signal weights to base values?')) return
    setRunning(true)
    try {
      await api.post('/backtest/reset-weights', {})
      setMsg({ type: 'ok', text: 'Weights reset to base values.' })
      await loadAll()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRunning(false) }
  }

  const btnStyle = (active) => ({
    padding: '5px 16px', borderRadius: 6, fontSize: 13, cursor: running ? 'not-allowed' : 'pointer',
    background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, fontWeight: active ? 700 : 400,
    opacity: running ? 0.6 : 1, transition: 'all .12s',
  })

  const actionBtn = (color) => ({
    padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: running ? 'not-allowed' : 'pointer',
    background: color, color: '#fff', border: 'none', fontWeight: 700,
    opacity: running ? 0.6 : 1,
  })

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <div className="section-title">🧠 Prediction Backtest &amp; RL Optimizer</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Every options analysis is logged as a prediction. When the timeframe expires, the
          actual outcome is evaluated and fed into the RL optimizer to improve signal weights.
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: msg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: msg.type === 'ok' ? 'var(--bull)' : 'var(--bear)' }}>
          {msg.text}
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={runEvaluate}  disabled={running} style={actionBtn('var(--accent)')}>
          {running ? '⏳ Running…' : '▶ Evaluate Matured'}
        </button>
        <button onClick={runTrain}     disabled={running} style={actionBtn('#7c3aed')}>
          🧠 Run RL Training
        </button>
        <button onClick={resetWeights} disabled={running} style={actionBtn('#6b7280')}>
          ↺ Reset Weights
        </button>
        <button onClick={loadAll}      disabled={loading} style={{ ...actionBtn('#374151'), marginLeft: 'auto' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total Logged"    value={stats.total_predictions} />
          <StatCard label="Evaluated"       value={stats.evaluated} />
          <StatCard label="Pending"         value={stats.pending} sub="awaiting expiry" />
          <StatCard label="Win Rate"        value={stats.win_rate_pct != null ? `${stats.win_rate_pct}%` : '—'}
                    color={stats.win_rate_pct >= 55 ? 'var(--bull)' : stats.win_rate_pct < 45 ? 'var(--bear)' : 'var(--text)'} />
          <StatCard label="Avg Return"      value={stats.avg_directional_return_pct != null ? `${stats.avg_directional_return_pct > 0 ? '+' : ''}${stats.avg_directional_return_pct}%` : '—'}
                    color={pctColor(stats.avg_directional_return_pct)} />
          <StatCard label="Bull Win Rate"   value={stats.bull_win_rate != null ? `${stats.bull_win_rate}%` : '—'} color="var(--bull)" />
          <StatCard label="Bear Win Rate"   value={stats.bear_win_rate != null ? `${stats.bear_win_rate}%` : '—'} color="var(--bear)" />
        </div>
      )}

      {/* By timeframe breakdown */}
      {stats?.by_timeframe?.length > 0 && (
        <div>
          <div className="section-title" style={{ fontSize: 13 }}>Performance by Timeframe</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {stats.by_timeframe.map(tf => {
              const wr = tf.evaluated > 0 ? Math.round(tf.wins / tf.evaluated * 100) : null
              return (
                <div key={tf.timeframe} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', minWidth: 90 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{tf.timeframe}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tf.evaluated}/{tf.total} eval</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: wr >= 55 ? 'var(--bull)' : wr != null && wr < 45 ? 'var(--bear)' : 'var(--muted)', marginTop: 2 }}>
                    {wr != null ? `${wr}%` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Signal weights */}
      {weights.length > 0 && (
        <div>
          <div className="section-title" style={{ fontSize: 13 }}>Signal Weights (RL Learned)</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            Weights drift from their base values as the RL optimizer learns which signals actually predict direction.
            Accuracy = % of predictions where this signal's contribution matched the correct outcome.
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 12, padding: '0 0 6px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              <div style={{ width: 150 }}>Signal</div>
              <div style={{ flex: 1 }}>Strength</div>
              <div style={{ width: 44, textAlign: 'right' }}>Weight</div>
              <div style={{ width: 52, textAlign: 'right' }}>Drift</div>
              <div style={{ width: 60, textAlign: 'right' }}>Accuracy</div>
            </div>
            {weights.map(w => (
              <WeightBar key={w.signal} signal={w.signal} weight={w.weight}
                base={w.base_weight} accuracy={w.accuracy} samples={w.sample_count} />
            ))}
          </div>
        </div>
      )}

      {/* Predictions table */}
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div className="section-title" style={{ margin: 0, fontSize: 13 }}>Prediction Log</div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
            {['evaluated', 'pending'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={btnStyle(tab === t)}>
                {t === 'evaluated' ? `Evaluated (${preds.length})` : `Pending (${pending.length})`}
              </button>
            ))}
          </div>
        </div>

        {tab === 'evaluated' && (
          preds.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No evaluated predictions yet. Predictions are logged automatically each time you view a ticker's options analysis. Check back after the timeframe window passes.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid var(--border)' }}>
                      {['Ticker', 'TF', 'Direction', 'Score', 'Entry', 'Return', 'Result', 'Date'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Ticker' || h === 'TF' || h === 'Direction' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preds.map(p => <PredRow key={p.id} p={p} />)}
                  </tbody>
                </table>
              </div>
            )
        )}

        {tab === 'pending' && (
          pending.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No pending predictions.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid var(--border)' }}>
                      {['Ticker', 'TF', 'Direction', 'Score', 'Entry', 'Eval Date'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Ticker' || h === 'TF' || h === 'Direction' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(p => <PendingRow key={p.id} p={p} />)}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>

      {/* How it works */}
      <div className="ov-glossary">
        <div className="ov-glossary-title">🔬 How the RL Optimizer Works</div>
        <div className="ov-glossary-grid">
          {[
            { term: 'Prediction Logging', def: 'Every time you view a ticker\'s options analysis, the dashboard logs the signals and predicted direction (bullish/bearish/neutral based on score). One log per ticker per timeframe per day.' },
            { term: 'Outcome Evaluation', def: 'After the timeframe window (e.g. 7 days for 1w), the system fetches the current stock price and compares it to the prediction. Bullish + price up = correct. Click "Evaluate Matured" to trigger this.' },
            { term: 'Contextual Bandit (RL)', def: 'Each signal (ATM P/C, IV rank, short squeeze, GEX, etc.) gets a weight. When a prediction is correct, signals that contributed to that prediction gain weight. When wrong, they lose weight. This is gradient descent on prediction accuracy.' },
            { term: 'Weight Drift', def: 'Green drift = signal is performing better than its base rate. Red drift = signal is hurting more than helping. Over ~50+ predictions per signal, weights stabilize and the dashboard automatically adjusts future scoring.' },
          ].map(({ term, def }) => (
            <div key={term} className="ov-glossary-item">
              <div className="ov-glossary-term">{term}</div>
              <div className="ov-glossary-def">{def}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}


export default function BacktestFeature() {
  return (
    <div className="feature-root">
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<BacktestDashboard />} />
        </Routes>
      </div>
    </div>
  )
}
