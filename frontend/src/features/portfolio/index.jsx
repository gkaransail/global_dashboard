import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import HoldingsView from './HoldingsView'

const TABS = [
  { path: 'holdings', label: '💼 Holdings & P&L' },
]

export default function PortfolioFeature() {
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
          <Route index element={<Navigate to="holdings" replace />} />
          <Route path="holdings" element={<HoldingsView />} />
          <Route path="summary"  element={<HoldingsView />} />
        </Routes>
      </div>
    </div>
  )
}
