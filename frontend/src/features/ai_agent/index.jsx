import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import AISummary from './AISummary'
import DeepResearch from './DeepResearch'
import ResearchChat from './ResearchChat'
import Debate from './Debate'

const TABS = [
  { path: 'summary',  label: '📝 AI Summary' },
  { path: 'research', label: '🔬 Deep Research' },
  { path: 'chat',     label: '💬 Research Chat' },
  { path: 'debate',   label: '⚔ Bull vs Bear' },
]

export default function AIAgentFeature() {
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
          <Route index element={<Navigate to="summary" replace />} />
          <Route path="summary"  element={<AISummary />} />
          <Route path="research" element={<DeepResearch />} />
          <Route path="chat"     element={<ResearchChat />} />
          <Route path="debate"   element={<Debate />} />
        </Routes>
      </div>
    </div>
  )
}
