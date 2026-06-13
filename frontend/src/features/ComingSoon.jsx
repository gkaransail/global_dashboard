export default function ComingSoon({ feature }) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-hero">
        <div className="coming-soon-icon-wrap">
          {feature.icon}
        </div>
        <span className="badge badge-soon">In Development</span>
        <h1 className="coming-soon-title">{feature.label}</h1>
        <p className="coming-soon-desc">{feature.description}</p>
        <div className="coming-soon-divider" />
      </div>

      <div className="coming-soon-features-section">
        <div className="coming-soon-features-label">What's included</div>
        <div className="coming-soon-feature-grid">
          {feature.subOptions.map(s => (
            <div key={s.id} className="coming-soon-feature-card">
              <div className="csf-icon">{s.icon}</div>
              <div className="csf-name">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="coming-soon-cta">
        <button
          className="coming-soon-notify-btn"
          onClick={() => {
            const email = prompt(`Get notified when ${feature.label} launches:\nEnter your email:`)
            if (email) alert(`Got it! We'll notify ${email} when ${feature.label} is live.`)
          }}
        >
          Get Early Access
        </button>
        <span className="coming-soon-eta">Join the waitlist · Launching soon</span>
      </div>
    </div>
  )
}
