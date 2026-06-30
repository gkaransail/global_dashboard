import { useState } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { useStore } from '../../core/store'
import TapeView        from './TapeView'
import LargePrintsView from './LargePrintsView'
import FootprintView   from './FootprintView'

const TABS = [
  { path: 'tape',         label: '📋 Tape' },
  { path: 'large_prints', label: '🐳 Large Prints' },
  { path: 'footprint',    label: '👣 Footprint' },
]

const TF_OPTIONS = [
  { key: '1d', label: 'Today (1m bars)' },
  { key: '2d', label: '2 Days (2m bars)' },
  { key: '5d', label: '5 Days (5m bars)' },
]

export default function OrderFlowFeature() {
  const { ticker: globalTicker, setTicker: setGlobalTicker } = useStore()
  const [ticker, setTicker] = useState(globalTicker || 'SPY')
  const [tf, setTf]         = useState('1d')

  function handleTickerChange(val) {
    const t = val.toUpperCase()
    setTicker(t)
    setGlobalTicker(t)
  }

  return (
    <div className="feature-root">

      {/* ── Shared filter bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
          ORDER FLOW
        </span>
        <input
          value={ticker}
          onChange={e => handleTickerChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleTickerChange(ticker)}
          placeholder="Ticker"
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '6px 12px', borderRadius: 6,
            fontSize: 13, width: 110, outline: 'none', fontWeight: 600,
          }}
        />
        <select
          value={tf}
          onChange={e => setTf(e.target.value)}
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '6px 12px', borderRadius: 6, fontSize: 13,
          }}
        >
          {TF_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
          — applies to all tabs
        </span>
      </div>

      {/* ── Tab nav ── */}
      <nav className="sub-tabs">
        {TABS.map(t => (
          <NavLink key={t.path} to={t.path}
            className={({ isActive }) => `sub-tab${isActive ? ' active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="tape" replace />} />
          <Route path="tape"         element={<TapeView        ticker={ticker} tf={tf} />} />
          <Route path="large_prints" element={<LargePrintsView ticker={ticker} tf={tf} />} />
          <Route path="footprint"    element={<FootprintView   ticker={ticker} tf={tf} />} />
        </Routes>
      </div>
    </div>
  )
}
