import { useState, useEffect } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'

const DIR_COLOR = { bullish_reversal: 'var(--bull)', bearish_reversal: 'var(--bear)', neutral: 'var(--neutral)' }
const DIR_ICON  = { bullish_reversal: '🟢', bearish_reversal: '🔴', neutral: '⚪' }

function retStr(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%' }
function retClass(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat' }

export default function SectorGrid() {
  const { setTicker } = useStore()
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await api.get('/reversal/sectors')
      setSectors(d)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /><span>Scanning all 11 sectors...</span></div>
  if (error)   return <div className="pad"><div className="error-box">⚠ {error}</div></div>

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Top 10 Sectors by Signal Strength
          {lastRefresh && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>· {lastRefresh}</span>}
        </div>
        <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>

      <div className="card-grid-3">
        {sectors.map((s, i) => {
          const color = DIR_COLOR[s.direction]
          const borderCls = s.direction === 'bullish_reversal' ? 'bull-border' : s.direction === 'bearish_reversal' ? 'bear-border' : 'neut-border'
          return (
            <div key={s.etf} className={`sector-card ${borderCls}`}
              onClick={() => setTicker(s.etf)}
              title={`Click to analyze ${s.etf}`}
            >
              <div className="sector-name">#{i + 1} {s.sector}</div>
              <div className="sector-conf-val" style={{ color }}>
                {DIR_ICON[s.direction]} {Math.round(s.confidence * 100)}%
              </div>
              <div className="sector-etf">{s.etf} · {s.signal_counts?.bullish}B / {s.signal_counts?.bearish}B signals</div>
              <div className="sector-ret-row">
                <span>5d: <strong className={retClass(s.return_5d_pct)}>{retStr(s.return_5d_pct)}</strong></span>
                <span>20d: <strong className={retClass(s.return_20d_pct)}>{retStr(s.return_20d_pct)}</strong></span>
                <span>${s.price}</span>
              </div>
              <div className="sector-sigs">
                {(s.top_signals || []).map((sig, j) => (
                  <div key={j} className="sector-sig-pill">
                    <span style={{ color: DIR_COLOR[sig.direction] }}>●</span>
                    {sig.name}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
