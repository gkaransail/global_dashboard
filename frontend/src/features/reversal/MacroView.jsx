import { useState, useEffect } from 'react'
import { api } from '../../core/api'

function retStr(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%' }
function retClass(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat' }

const TREND_NOTES = {
  gold:   { up: 'Risk-off — bearish for equities', down: 'Risk-on — bullish tailwind' },
  dxy:    { up: 'Strong dollar — headwind for stocks', down: 'Weak dollar — bullish for multinationals' },
  vix:    { up: 'Fear rising — watch for reversal', down: 'Complacency — correction risk' },
  oil:    { up: 'Inflationary pressure', down: 'Deflationary signal' },
  tnx:    { up: 'Rate pressure — growth stocks at risk', down: 'Easing rates — multiple expansion' },
  copper: { up: 'Economic expansion signal', down: 'Slowdown warning' },
  qqq:    { up: 'Tech momentum positive', down: 'Tech under pressure' },
}

export default function MacroView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/reversal/macro').then(setData).catch(() => {}).finally(() => setLoading(false))
    const id = setInterval(() => api.get('/reversal/macro').then(setData).catch(() => {}), 60000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) return <div className="spinner-wrap"><div className="spinner" /><span>Loading macro data...</span></div>

  const entries = data ? Object.entries(data).filter(([, v]) => v) : []

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="section-title">Live Macro Environment — auto-refreshes every 60s</div>
        <div className="card-grid-4">
          {entries.map(([key, info]) => {
            const r20 = info.return_20d_pct
            const r5  = info.return_5d_pct
            const trend = r20 > 0 ? 'up' : 'down'
            const note = TREND_NOTES[key]?.[trend] ?? ''
            return (
              <div key={key} className="macro-card">
                <div className="macro-label">{info.label}</div>
                <div className="macro-price">{info.price?.toLocaleString()}</div>
                <div className="macro-ret">
                  <span className={retClass(r5)}>{retStr(r5)} (5d)</span>
                  {'  '}
                  <span className={retClass(r20)}>{retStr(r20)} (20d)</span>
                </div>
                {note && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>{note}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="section-title">Macro Signal Interpretation</div>
        <div className="card" style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
            <div><strong style={{ color: 'var(--text)' }}>Gold + DXY both rising</strong> → Flight-to-safety panic, severe risk-off</div>
            <div><strong style={{ color: 'var(--text)' }}>VIX &gt; 35</strong> → Extreme fear, contrarian bullish setup</div>
            <div><strong style={{ color: 'var(--text)' }}>Copper rising</strong> → Global growth expanding (Dr. Copper)</div>
            <div><strong style={{ color: 'var(--text)' }}>10Y Yield spiking</strong> → Rate pressure compresses growth multiples</div>
            <div><strong style={{ color: 'var(--text)' }}>Oil crashing (-15%+)</strong> → Deflationary signal, energy weakness</div>
            <div><strong style={{ color: 'var(--text)' }}>DXY falling</strong> → Dollar weakness boosts multinationals, EM</div>
          </div>
        </div>
      </div>
    </div>
  )
}
