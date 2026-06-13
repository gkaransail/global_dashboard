import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import WatchlistView from './WatchlistView'
import AlertsManager from './AlertsManager'

const TABS = [
  { path: 'watchlist', label: '👁 Watchlist' },
  { path: 'alerts',    label: '🔔 Price Alerts' },
]

export default function AlertsFeature() {
  return (
    <div className="feature-root">
      <nav className="sub-tabs">
        {TABS.map(t => (
          <NavLink key={t.path} to={t.path} className={({ isActive }) => `sub-tab${isActive ? ' active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="watchlist" replace />} />
          <Route path="watchlist" element={<WatchlistView />} />
          <Route path="alerts"    element={<AlertsManager />} />
        </Routes>
      </div>
    </div>
  )
}
