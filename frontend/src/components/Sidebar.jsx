import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { FEATURES, SECTION_LABELS, TIMEFRAME_META } from '../features'

let _globalCollapsed = false

// Build ordered section list preserving feature order
function getSections(features) {
  const order = []
  const map = {}
  for (const f of features) {
    const s = f.section || 'other'
    if (!map[s]) { map[s] = []; order.push(s) }
    map[s].push(f)
  }
  return order.map(s => ({ key: s, label: SECTION_LABELS[s] || s, features: map[s] }))
}

const TIMEFRAME_FILTERS = [
  { key: 'all',    label: 'All',    icon: null },
  { key: 'short',  label: 'Short',  icon: '⚡' },
  { key: 'medium', label: 'Mid',    icon: '🕐' },
  { key: 'long',   label: 'Long',   icon: '📅' },
  { key: 'meta',   label: 'Meta',   icon: '🔮' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeFeature = FEATURES.find(f => location.pathname.startsWith(`/${f.id}`))
  const [expanded, setExpanded] = useState(activeFeature?.id ?? null)
  const [collapsed, setCollapsed] = useState(_globalCollapsed)
  const [timeframeFilter, setTimeframeFilter] = useState('all')

  function toggleCollapse() {
    _globalCollapsed = !collapsed
    setCollapsed(c => !c)
  }

  function handleFeatureClick(feature) {
    if (collapsed) {
      setCollapsed(false)
      _globalCollapsed = false
    }
    setExpanded(feature.id)
    navigate(feature.subOptions?.[0]?.path ?? `/${feature.id}`)
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

      {/* Dashboard home link */}
      <div style={{ padding: collapsed ? '8px 8px 4px' : '8px 10px 4px' }}>
        <button
          onClick={() => navigate('/')}
          title={collapsed ? 'Dashboard' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 8, justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: location.pathname === '/' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: location.pathname === '/' ? 'var(--accent-hi)' : 'var(--text-dim)',
            fontSize: 13, fontWeight: location.pathname === '/' ? 700 : 400,
          }}
        >
          <span style={{ fontSize: 16 }}>🏠</span>
          {!collapsed && <span>Dashboard</span>}
        </button>
      </div>

      {/* Divider */}
      {!collapsed && <div style={{ height: 1, background: 'var(--border)', margin: '0 12px 4px' }} />}

      {/* Timeframe filter tabs */}
      {!collapsed && (
        <div style={{ display: 'flex', gap: 3, padding: '6px 10px 2px', flexWrap: 'wrap' }}>
          {TIMEFRAME_FILTERS.map(tf => {
            const isActive = timeframeFilter === tf.key
            const color = tf.key === 'all' ? 'var(--accent-hi)' : TIMEFRAME_META[tf.key]?.color
            return (
              <button
                key={tf.key}
                onClick={() => setTimeframeFilter(tf.key)}
                style={{
                  flex: 1, minWidth: 0, padding: '3px 4px', borderRadius: 6, border: 'none',
                  cursor: 'pointer', fontSize: 10, fontWeight: isActive ? 700 : 400,
                  background: isActive ? (tf.key === 'all' ? 'rgba(99,102,241,0.15)' : `${color}22`) : 'transparent',
                  color: isActive ? color : 'var(--muted)',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {tf.icon ? `${tf.icon} ${tf.label}` : tf.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Feature nav — grouped by section */}
      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {getSections(timeframeFilter === 'all' ? FEATURES : FEATURES.filter(f => f.timeframe === timeframeFilter)).map(({ key, label, features }) => (
          <div key={key}>
            {/* Section header */}
            {!collapsed && (
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--muted)', padding: '10px 14px 4px',
                textTransform: 'uppercase',
              }}>
                {label}
              </div>
            )}
            {collapsed && <div style={{ height: 6 }} />}

            {features.map(feature => {
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
                    <span style={{ position: 'relative', flexShrink: 0 }}>
                      <span className="sidebar-feature-icon" style={{ fontSize: 15 }}>{feature.icon}</span>
                      {feature.timeframe && (
                        <span style={{
                          position: 'absolute', bottom: -1, right: -3,
                          width: 5, height: 5, borderRadius: '50%',
                          background: TIMEFRAME_META[feature.timeframe]?.color ?? 'var(--muted)',
                          border: '1px solid var(--bg)',
                        }} />
                      )}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="sidebar-feature-label">{feature.label}</span>
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
        ))}
      </div>

      {/* Footer */}
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
