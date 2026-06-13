import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { FEATURES } from '../features'

// Persists collapse state across route changes
let _globalCollapsed = false

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeFeature = FEATURES.find(f => location.pathname.startsWith(`/${f.id}`))
  const [expanded, setExpanded] = useState(activeFeature?.id ?? 'reversal')
  const [collapsed, setCollapsed] = useState(_globalCollapsed)

  function toggleCollapse() {
    _globalCollapsed = !collapsed
    setCollapsed(c => !c)
  }

  function handleFeatureClick(feature) {
    if (collapsed) {
      setCollapsed(false)
      _globalCollapsed = false
    }
    if (feature.status === 'coming_soon' || !feature.subOptions?.length) {
      setExpanded(expanded === feature.id ? null : feature.id)
      navigate(`/${feature.id}`)
      return
    }
    setExpanded(feature.id)
    navigate(feature.subOptions[0].path)
  }

  function handleSubClick(sub) {
    navigate(sub.path)
  }

  const w = collapsed ? 'var(--sidebar-collapsed-w)' : 'var(--sidebar-w)'

  return (
    <aside className="sidebar" style={{ width: w, minWidth: w, transition: 'width 0.2s ease, min-width 0.2s ease' }}>
      {/* Logo */}
      <div className="sidebar-logo" style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div className="sidebar-logo-mark" style={{ flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 13L6.5 7.5L10 10.5L15.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="15.5" cy="4" r="1.5" fill="white"/>
          </svg>
        </div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">
              FinanceIQ
              <span className="sidebar-logo-beta">Beta</span>
            </div>
            <div className="sidebar-logo-sub">Market Intelligence</div>
          </div>
        )}
      </div>

      {/* Home link */}
      <div style={{ padding: collapsed ? '8px 8px 4px' : '8px 10px 4px' }}>
        <button
          onClick={() => navigate('/')}
          title={collapsed ? 'Market Intelligence Hub' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 8, justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: location.pathname === '/' ? 'rgba(59,130,246,0.15)' : 'transparent',
            color: location.pathname === '/' ? 'var(--accent-hi)' : 'var(--text-dim)',
            fontSize: 13, fontWeight: location.pathname === '/' ? 700 : 400,
          }}
        >
          <span style={{ fontSize: 16 }}>🎯</span>
          {!collapsed && <span>Market Intelligence</span>}
        </button>
      </div>

      {/* Feature nav */}
      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {!collapsed && <div className="sidebar-section-label">Modules</div>}
        {FEATURES.map(feature => {
          const isExpanded = expanded === feature.id && !collapsed
          const isActive = activeFeature?.id === feature.id

          return (
            <div key={feature.id} className="sidebar-feature">
              <button
                className={`sidebar-feature-btn ${isActive ? 'active' : ''}`}
                onClick={() => handleFeatureClick(feature)}
                title={collapsed ? feature.label : undefined}
                style={{ justifyContent: collapsed ? 'center' : 'flex-start', paddingLeft: collapsed ? 0 : undefined }}
              >
                <span className="sidebar-feature-icon" style={{ fontSize: 16 }}>{feature.icon}</span>
                {!collapsed && (
                  <>
                    <span className="sidebar-feature-label">{feature.label}</span>
                    {feature.status === 'coming_soon' && (
                      <span className="sidebar-coming-soon">Soon</span>
                    )}
                    <span className={`sidebar-feature-arrow ${isExpanded ? 'open' : ''}`}>›</span>
                  </>
                )}
              </button>

              {isExpanded && feature.subOptions?.length > 0 && (
                <div className="sidebar-sub-options">
                  {feature.subOptions.map(sub => {
                    const isSubActive = location.pathname === sub.path
                    return (
                      <button
                        key={sub.id}
                        className={`sidebar-sub-btn ${isSubActive ? 'active' : ''}`}
                        onClick={() => handleSubClick(sub)}
                      >
                        <span>{sub.icon}</span>
                        <span>{sub.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: collapse toggle + status */}
      <div className="sidebar-footer" style={{ flexDirection: 'column', gap: 8, padding: '12px 10px' }}>
        <button
          onClick={toggleCollapse}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 8, justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--muted)', fontSize: 13,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span style={{ fontSize: 14 }}>{collapsed ? '›' : '‹'}</span>
          {!collapsed && <span>Collapse</span>}
        </button>

        {!collapsed && (
          <div className="sidebar-footer-status" style={{ justifyContent: 'space-between', width: '100%', padding: '0 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Live data</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>v1.0</span>
          </div>
        )}
      </div>
    </aside>
  )
}
