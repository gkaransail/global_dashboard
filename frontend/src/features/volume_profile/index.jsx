import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import VolumeProfileView from './VolumeProfileView'
import DeltaFlowView from './DeltaFlowView'

const TABS = [
  { path: 'profile', label: '📊 Volume Profile' },
  { path: 'delta',   label: 'Δ Delta Flow' },
]

export default function VolumeProfileFeature() {
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
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<VolumeProfileView />} />
          <Route path="delta"   element={<DeltaFlowView />} />
        </Routes>
      </div>
    </div>
  )
}
