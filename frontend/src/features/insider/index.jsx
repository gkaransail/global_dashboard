import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import TransactionFeed from './TransactionFeed'
import ClusterBuys from './ClusterBuys'

const TABS = [
  { path: 'feed',    label: '📋 Transaction Feed' },
  { path: 'cluster', label: '🎯 Cluster Buys' },
]

export default function InsiderFeature() {
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
          <Route index element={<Navigate to="feed" replace />} />
          <Route path="feed"    element={<TransactionFeed />} />
          <Route path="cluster" element={<ClusterBuys />} />
        </Routes>
      </div>
    </div>
  )
}
