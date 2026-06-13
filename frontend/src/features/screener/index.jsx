import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import MultiFactorScreen from './MultiFactorScreen'
import SingleScore from './SingleScore'
import SchedulerStatus from './SchedulerStatus'

const TABS = [
  { path: 'screen',    label: '🔭 Screener' },
  { path: 'score',     label: '🎯 Single Score' },
  { path: 'scheduler', label: '⏰ Scheduler' },
]

export default function ScreenerFeature() {
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
          <Route index element={<Navigate to="screen" replace />} />
          <Route path="screen"    element={<MultiFactorScreen />} />
          <Route path="score"     element={<SingleScore />} />
          <Route path="scheduler" element={<SchedulerStatus />} />
        </Routes>
      </div>
    </div>
  )
}
