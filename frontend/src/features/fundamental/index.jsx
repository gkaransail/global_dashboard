import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { useStore } from '../../core/store'
import ValuationView from './ValuationView'
import GrowthView from './GrowthView'
import QualityView from './QualityView'
import FundamentalScreener from './FundamentalScreener'

const TABS = [
  { path: 'valuation', label: '💹 Valuation' },
  { path: 'growth',    label: '📈 Growth' },
  { path: 'quality',   label: '🏥 Quality' },
  { path: 'screener',  label: '🔎 Screener' },
]

export default function FundamentalFeature() {
  const setTicker = useStore(s => s.setTicker)
  const navigate = useNavigate()

  const handleSelectTicker = (ticker) => {
    setTicker(ticker)
    navigate('valuation')
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
          <Route index element={<Navigate to="valuation" replace />} />
          <Route path="valuation" element={<ValuationView />} />
          <Route path="growth"    element={<GrowthView />} />
          <Route path="quality"   element={<QualityView />} />
          <Route path="screener"  element={<FundamentalScreener onSelectTicker={handleSelectTicker} />} />
        </Routes>
      </div>
    </div>
  )
}
