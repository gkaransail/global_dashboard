import { Routes, Route, Navigate } from 'react-router-dom'
import SentimentDashboard from './SentimentDashboard'

export default function SentimentFeature() {
  return (
    <div className="feature-root">
      <div className="sub-content">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SentimentDashboard />} />
        </Routes>
      </div>
    </div>
  )
}
