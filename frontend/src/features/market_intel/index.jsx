import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import RankedPicks from './RankedPicks'
import MarketOverview from './MarketOverview'

const TABS = [
  { path: 'scan',   label: '🎯 Ranked Picks' },
  { path: 'market', label: '🌐 Market Overview' },
]

export default function MarketIntelFeature() {
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
          <Route index element={<Navigate to="scan" replace />} />
          <Route path="scan"   element={<RankedPicks />} />
          <Route path="market" element={<MarketOverview />} />
        </Routes>
      </div>
    </div>
  )
}
