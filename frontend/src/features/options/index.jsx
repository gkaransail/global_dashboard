import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import OptionsOverview from './OptionsOverview'
import OptionsChain from './OptionsChain'
import UnusualActivity from './UnusualActivity'
import VolSkew from './VolSkew'
import OptionsTopMovers from './OptionsTopMovers'

const TABS = [
  { path: 'overview', label: '🏠 Overview' },
  { path: 'chain',    label: '⛓ Chain' },
  { path: 'unusual',  label: '🚨 Unusual Activity' },
  { path: 'skew',     label: '📐 IV Skew' },
  { path: 'scanner',  label: '🏆 Top 20' },
]

export default function OptionsFeature() {
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
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OptionsOverview />} />
          <Route path="chain"    element={<OptionsChain />} />
          <Route path="unusual"  element={<UnusualActivity />} />
          <Route path="skew"     element={<VolSkew />} />
          <Route path="scanner"  element={<OptionsTopMovers />} />
        </Routes>
      </div>
    </div>
  )
}
