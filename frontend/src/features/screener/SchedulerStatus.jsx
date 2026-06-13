import { useState, useEffect } from 'react'
import { api } from '../../core/api'

const JOB_LABELS = {
  screener_full_scan:  { label: 'Multi-Factor Screener', icon: '🔭', interval: '25 min' },
  smart_money_scan:    { label: 'Smart Money Scan',      icon: '💰', interval: '50 min' },
  technical_screener:  { label: 'Technical Screener',    icon: '📈', interval: '4 min'  },
  news_sentiment:      { label: 'News Sentiment',        icon: '🧬', interval: '12 min' },
  options_top_tickers: { label: 'Options Top Tickers',   icon: '📋', interval: '4 min'  },
}

function timeSince(iso) {
  if (!iso) return '—'
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60)  return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

function timeUntil(iso) {
  if (!iso) return '—'
  const secs = Math.floor((new Date(iso) - Date.now()) / 1000)
  if (secs <= 0)   return 'now'
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h`
}

export default function SchedulerStatus() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [tick,    setTick]    = useState(0)

  // Refresh status every 15 seconds
  useEffect(() => {
    fetchStatus()
    const id = setInterval(() => { fetchStatus(); setTick(t => t + 1) }, 15000)
    return () => clearInterval(id)
  }, [])

  async function fetchStatus() {
    if (loading) return
    setLoading(true)
    try {
      const result = await api.get('/scheduler/status')
      setData(result)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pad" style={{ maxWidth: 700 }}>
      <div className="ai-section-header">
        <div>
          <h2 className="ai-section-title">⏰ Cache Warm-Up Scheduler</h2>
          <p className="ai-section-sub">
            Background jobs that pre-fetch data before TTL expires — so every user hits a warm cache
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data && (
            <span style={{
              background: data.running ? '#22c55e22' : '#ef444422',
              color:       data.running ? '#22c55e'   : '#ef4444',
              border:      `1px solid ${data.running ? '#22c55e' : '#ef4444'}55`,
              borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 10px',
            }}>
              {data.running ? '● RUNNING' : '○ STOPPED'}
            </span>
          )}
          <button className="btn-secondary" onClick={fetchStatus} disabled={loading}>
            {loading ? '…' : '↺'}
          </button>
        </div>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {/* How it works explanation */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, letterSpacing: 0.8 }}>
          HOW CACHE WARMING WORKS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Without warming', 'First request after TTL expires pays full fetch cost (5-45s). Users experience slow loads randomly.', '#ef4444'],
            ['With warming', 'Background jobs re-fetch data just before TTL expires. Every request hits warm cache — always instant.', '#22c55e'],
          ].map(([title, desc, color]) => (
            <div key={title} style={{ background: '#020817', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
          <b style={{ color: '#94a3b8' }}>Pattern:</b> APScheduler BackgroundScheduler runs in a daemon thread alongside FastAPI.
          Each job fires at <code style={{ background: '#1e293b', padding: '0 4px', borderRadius: 3 }}>TTL - buffer</code> interval,
          calling the same Python functions the API endpoints call. Jobs write to the shared in-memory cache — so the next HTTP request finds it pre-populated.
        </div>
      </div>

      {/* Job table */}
      {data?.jobs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.jobs.map(job => {
            const meta = JOB_LABELS[job.id] || { label: job.id, icon: '⚙', interval: '?' }
            const isOk = job.status === 'ok'
            const isPending = job.status === 'pending'
            const statusColor = isOk ? '#22c55e' : isPending ? '#f59e0b' : '#ef4444'

            return (
              <div key={job.id} style={{
                background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ fontSize: 18 }}>{meta.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Every {meta.interval} · job id: {job.id}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 80 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Last run</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{timeSince(job.last_run)}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Next run</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{timeUntil(job.next_run)}</div>
                </div>
                <div style={{ minWidth: 70, textAlign: 'right' }}>
                  <span style={{
                    background: statusColor + '22', color: statusColor,
                    border: `1px solid ${statusColor}55`,
                    borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                  }}>
                    {isPending ? 'PENDING' : isOk ? 'OK' : 'ERROR'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: '#475569', lineHeight: 1.8 }}>
        Status auto-refreshes every 15s · Scheduler starts automatically with the backend process ·
        To keep data fresh indefinitely: keep the backend running with{' '}
        <code style={{ background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>
          uvicorn main:app --port 8000
        </code>
      </div>
    </div>
  )
}
