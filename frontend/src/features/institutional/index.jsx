import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import HoldersView from './HoldersView'
import FlowView from './FlowView'
import ScreenerView from './ScreenerView'

const TABS = [
  { path: 'holders',  label: '🏛 Top Holders' },
  { path: 'flow',     label: '🌊 Fund Flow' },
  { path: 'screener', label: '🔎 Screener' },
]

export default function InstitutionalFeature() {
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
          <Route index element={<Navigate to="holders" replace />} />
          <Route path="holders"  element={<HoldersView />} />
          <Route path="flow"     element={<FlowView />} />
          <Route path="screener" element={<ScreenerView />} />
        </Routes>
      </div>
    </div>
  )
}
