import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import IndicatorsView from './IndicatorsView'
import PatternsView from './PatternsView'
import LevelsView from './LevelsView'
import ScreenerView from './ScreenerView'

const TABS = [
  { path: 'indicators', label: '📊 Indicators' },
  { path: 'patterns',   label: '🔍 Patterns' },
  { path: 'levels',     label: '📏 Support/Resistance' },
  { path: 'screener',   label: '🔎 Screener' },
]

export default function TechnicalFeature() {
  const navigate = useNavigate()

  const handleSelectTicker = () => {
    navigate('indicators')
  }

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
          <Route index element={<Navigate to="indicators" replace />} />
          <Route path="indicators" element={<IndicatorsView />} />
          <Route path="patterns"   element={<PatternsView />} />
          <Route path="levels"     element={<LevelsView />} />
          <Route path="screener"   element={<ScreenerView onSelectTicker={handleSelectTicker} />} />
        </Routes>
      </div>
    </div>
  )
}
