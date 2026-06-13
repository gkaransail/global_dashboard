import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import NewsSentiment from './NewsSentiment'
import TextAnalyzer from './TextAnalyzer'
import TickerCompare from './TickerCompare'

const TABS = [
  { path: 'news',    label: '📰 News Sentiment' },
  { path: 'analyze', label: '🧬 Text Analyzer' },
  { path: 'compare', label: '⚖ Ticker Compare' },
]

export default function SentimentAIFeature() {
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
          <Route index element={<Navigate to="news" replace />} />
          <Route path="news"    element={<NewsSentiment />} />
          <Route path="analyze" element={<TextAnalyzer />} />
          <Route path="compare" element={<TickerCompare />} />
        </Routes>
      </div>
    </div>
  )
}
