import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import ReversalDashboard from './ReversalDashboard'
import SectorGrid from './SectorGrid'
import Watchlist from './Watchlist'
import MacroView from './MacroView'

const TABS = [
  { path: 'analyze',   label: '🔍 Single Stock' },
  { path: 'sectors',   label: '🗂 Sector Scan' },
  { path: 'watchlist', label: '📋 Watchlist' },
  { path: 'macro',     label: '🌍 Macro View' },
]

export default function ReversalFeature() {
  return (
    <div className="feature-root">
      <nav className="sub-tabs">
        {TABS.map(t => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) => `sub-tab${isActive ? ' active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="analyze" replace />} />
          <Route path="analyze"   element={<ReversalDashboard />} />
          <Route path="sectors"   element={<SectorGrid />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="macro"     element={<MacroView />} />
        </Routes>
      </div>
    </div>
  )
}
