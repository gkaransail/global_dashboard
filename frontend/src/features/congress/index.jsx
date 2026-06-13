import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import TradeFeed from './TradeFeed'
import TopMembers from './TopMembers'
import HotTickers from './HotTickers'

const TABS = [
  { path: 'feed',    label: '📋 Trade Feed' },
  { path: 'members', label: '👤 Top Members' },
  { path: 'tickers', label: '🔥 Hot Tickers' },
]

export default function CongressFeature() {
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
          <Route path="feed"    element={<TradeFeed />} />
          <Route path="members" element={<TopMembers />} />
          <Route path="tickers" element={<HotTickers />} />
        </Routes>
      </div>
    </div>
  )
}
