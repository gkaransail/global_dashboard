import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import TapeView        from './TapeView'
import LargePrintsView from './LargePrintsView'
import FootprintView   from './FootprintView'

const TABS = [
  { path: 'tape',         label: '📋 Tape' },
  { path: 'large_prints', label: '🐳 Large Prints' },
  { path: 'footprint',    label: '👣 Footprint' },
]

export default function OrderFlowFeature() {
  return (
    <div className="feature-root">
      <nav className="sub-tabs">
        {TABS.map(t => (
          <NavLink key={t.path} to={t.path}
            className={({ isActive }) => `sub-tab${isActive ? ' active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="tape" replace />} />
          <Route path="tape"         element={<TapeView />} />
          <Route path="large_prints" element={<LargePrintsView />} />
          <Route path="footprint"    element={<FootprintView />} />
        </Routes>
      </div>
    </div>
  )
}
