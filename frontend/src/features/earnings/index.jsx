import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import EarningsCalendar from './EarningsCalendar'
import EarningsAnalysis from './EarningsAnalysis'

const TABS = [
  { path: 'calendar', label: '📅 Calendar' },
  { path: 'analysis', label: '📊 Analysis' },
]

export default function EarningsFeature() {
  const [selectedTicker, setSelectedTicker] = useState('')
  const navigate = useNavigate()

  const handleSelectTicker = (ticker) => {
    setSelectedTicker(ticker)
    navigate('analysis')
  }

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
          <Route index element={<Navigate to="calendar" replace />} />
          <Route path="calendar" element={<EarningsCalendar onSelectTicker={handleSelectTicker} />} />
          <Route path="analysis" element={<EarningsAnalysis initialTicker={selectedTicker} />} />
        </Routes>
      </div>
    </div>
  )
}
