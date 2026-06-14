import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TickerBar from './components/TickerBar'
import MarketHub from './features/MarketHub'
import ReversalFeature from './features/reversal/index'
import OptionsFeature from './features/options/index'
import EarningsFeature from './features/earnings/index'
import SentimentFeature from './features/sentiment/index'
import TechnicalFeature from './features/technical/index'
import FundamentalFeature from './features/fundamental/index'
import InsiderFeature from './features/insider/index'
import AIAgentFeature from './features/ai_agent/index'
import SentimentAIFeature from './features/sentiment_ai/index'
import ScreenerFeature from './features/screener/index'
import CongressFeature from './features/congress/index'
import MarketIntelFeature from './features/market_intel/index'
import InstitutionalFeature from './features/institutional/index'
import PortfolioFeature from './features/portfolio/index'
import AlertsFeature from './features/alerts/index'

export default function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#020817', color: '#e2e8f0' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TickerBar />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<MarketHub />} />
            <Route path="/reversal/*"      element={<ReversalFeature />} />
            <Route path="/options/*"       element={<OptionsFeature />} />
            <Route path="/earnings/*"      element={<EarningsFeature />} />
            <Route path="/technical/*"     element={<TechnicalFeature />} />
            <Route path="/fundamental/*"   element={<FundamentalFeature />} />
            <Route path="/sentiment/*"     element={<SentimentFeature />} />
            <Route path="/insider/*"       element={<InsiderFeature />} />
            <Route path="/ai_agent/*"      element={<AIAgentFeature />} />
            <Route path="/screener/*"      element={<ScreenerFeature />} />
            <Route path="/sentiment_ai/*"  element={<SentimentAIFeature />} />
            <Route path="/congress/*"      element={<CongressFeature />} />
            <Route path="/market_intel/*"  element={<MarketIntelFeature />} />
            <Route path="/institutional/*" element={<InstitutionalFeature />} />
            <Route path="/portfolio/*"     element={<PortfolioFeature />} />
            <Route path="/alerts/*"        element={<AlertsFeature />} />
            {/* Smart Money merged into Stock Rankings — redirect old URLs */}
            <Route path="/smart_money/*"   element={<Navigate to="/market_intel/smart_money" replace />} />
            <Route path="*"                element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
