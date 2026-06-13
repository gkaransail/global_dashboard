import { useNavigate } from 'react-router-dom'
import { FEATURES } from './index'

const LogoMark = ({ size = 28 }) => (
  <div className="landing-logo-mark" style={{ width: size, height: size, borderRadius: size * 0.2 }}>
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 18 18" fill="none">
      <path d="M2 13L6.5 7.5L10 10.5L15.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="15.5" cy="4" r="1.5" fill="white"/>
    </svg>
  </div>
)

const PREVIEW_SIGNALS = [
  { name: 'RSI Oversold Bounce', cat: 'TECHNICAL', val: '72%', bull: true },
  { name: 'MACD Bullish Crossover', cat: 'TECHNICAL', val: '65%', bull: true },
  { name: 'Copper Rising (Dr. Copper)', cat: 'MACRO', val: '58%', bull: true },
  { name: 'Fear & Greed: Extreme (82)', cat: 'SENTIMENT', val: '51%', bull: false },
]

const STEPS = [
  { num: '01', title: 'Enter any ticker', desc: 'Type any stock symbol — AAPL, NVDA, SPY, or 10,000+ others supported.' },
  { num: '02', title: '23 signals in ~2s', desc: 'Technical, macro, breadth, and sentiment signals computed and weighted instantly.' },
  { num: '03', title: 'Act with confidence', desc: 'Clear BULLISH / BEARISH / NEUTRAL verdict with confidence score and full AI explanation.' },
]

const STATS = [
  { val: '23+', label: 'Signals per analysis' },
  { val: '8',   label: 'Analysis modules' },
  { val: '4',   label: 'Signal categories' },
  { val: '5s',  label: 'Avg. analysis time' },
]

export default function LandingPage() {
  const navigate = useNavigate()

  function launchDashboard() {
    navigate('/reversal/analyze')
  }

  return (
    <div className="landing">

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <LogoMark size={30} />
          <span className="landing-nav-name">FinanceIQ</span>
          <span className="landing-beta-pill">Beta</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </div>
        <button className="landing-btn-primary landing-btn-sm" onClick={launchDashboard}>
          Launch App →
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-badge">
            <span className="landing-live-dot" />
            Live data · Real-time signals
          </div>

          <h1 className="landing-hero-title">
            Institutional-grade<br />
            <span className="landing-gradient-text">market intelligence</span><br />
            for every investor.
          </h1>

          <p className="landing-hero-sub">
            Multi-factor reversal signals, live options flow, sector rotation,<br />
            smart money tracking, and AI research — in one terminal-grade dashboard.
          </p>

          <div className="landing-hero-ctas">
            <button className="landing-btn-primary landing-btn-lg" onClick={launchDashboard}>
              Launch Dashboard — Free →
            </button>
            <button className="landing-btn-ghost landing-btn-lg" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>
              See all features
            </button>
          </div>

          {/* Dashboard preview widget */}
          <div className="landing-preview-wrap">
            <div className="landing-preview">
              <div className="landing-preview-chrome">
                <div className="lp-chrome-dots">
                  <span className="lp-dot red" /><span className="lp-dot yellow" /><span className="lp-dot green" />
                </div>
                <div className="lp-chrome-title">FinanceIQ · Reversal Analysis · NVDA</div>
                <div className="lp-chrome-live"><span className="landing-live-dot" />Live</div>
              </div>
              <div className="landing-preview-body">
                <div className="landing-preview-left">
                  <div className="lp-ticker-row">
                    <span className="lp-ticker">NVDA</span>
                    <span className="lp-price">$875.40</span>
                    <span className="lp-change up">+2.14%</span>
                  </div>
                  <div className="lp-verdict bull">
                    <span className="lp-verdict-icon">🟢</span>
                    <div>
                      <div className="lp-verdict-label">BULLISH REVERSAL</div>
                      <div className="lp-verdict-sub">Strong signal · 73% confidence</div>
                    </div>
                    <div className="lp-conf-wrap">
                      <div className="lp-conf-track">
                        <div className="lp-conf-fill" style={{ width: '73%' }} />
                      </div>
                      <span className="lp-conf-num bull">73%</span>
                    </div>
                  </div>
                  <div className="lp-breakdown">
                    {[
                      { cat: 'Technical', w: '35%', score: '+18.2%', bull: true },
                      { cat: 'Macro', w: '30%', score: '+12.1%', bull: true },
                      { cat: 'Breadth', w: '20%', score: '+5.4%', bull: true },
                      { cat: 'Sentiment', w: '15%', score: '-3.8%', bull: false },
                    ].map(b => (
                      <div key={b.cat} className="lp-bd-row">
                        <span className="lp-bd-cat">{b.cat}</span>
                        <span className="lp-bd-w">{b.w}</span>
                        <span className={`lp-bd-score ${b.bull ? 'up' : 'down'}`}>{b.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="landing-preview-right">
                  <div className="lp-signals-label">Signals Detected (23)</div>
                  {PREVIEW_SIGNALS.map((s, i) => (
                    <div key={i} className="lp-signal-row">
                      <span className={`lp-sig-dot ${s.bull ? 'bull' : 'bear'}`} />
                      <div className="lp-sig-info">
                        <div className="lp-sig-name">{s.name}</div>
                        <span className="lp-sig-cat">{s.cat}</span>
                      </div>
                      <span className={`lp-sig-val ${s.bull ? 'up' : 'down'}`}>{s.val}</span>
                    </div>
                  ))}
                  <div className="lp-more-signals">+ 19 more signals</div>
                </div>
              </div>
            </div>
            <div className="landing-preview-glow" />
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <div className="landing-stats-strip">
        {STATS.map((s, i) => (
          <div key={i} className="lss-stat">
            <div className="lss-val">{s.val}</div>
            <div className="lss-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="landing-section">
        <div className="landing-section-header">
          <span className="badge badge-accent">8 Modules</span>
          <h2 className="landing-section-title">Everything you need to trade smarter</h2>
          <p className="landing-section-sub">
            From raw signal detection to AI-powered deep research —<br />
            one platform, complete picture.
          </p>
        </div>

        <div className="landing-features-grid">
          {FEATURES.map(f => (
            <div
              key={f.id}
              className={`landing-feature-card ${f.status === 'live' ? 'lfc-live' : ''}`}
              onClick={() => f.status === 'live' && navigate(`/${f.id}`)}
            >
              <div className="lfc-top">
                <span className="lfc-icon-wrap">{f.icon}</span>
                <span className={`badge ${f.status === 'live' ? 'badge-live' : 'badge-soon'}`}>
                  {f.status === 'live' ? 'Live' : 'Soon'}
                </span>
              </div>
              <div className="lfc-name">{f.label}</div>
              <div className="lfc-desc">{f.description}</div>
              <div className="lfc-subs">
                {f.subOptions.map(s => (
                  <span key={s.id} className="lfc-sub-pill">{s.label}</span>
                ))}
              </div>
              {f.status === 'live' && (
                <div className="lfc-cta">Open module →</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-section-header">
          <span className="badge badge-accent">Simple</span>
          <h2 className="landing-section-title">Start analyzing in seconds</h2>
          <p className="landing-section-sub">No setup. No API keys. No configuration.</p>
        </div>

        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <div key={i} className="landing-step-wrap">
              <div className="landing-step">
                <div className="ls-num">{s.num}</div>
                <div className="ls-title">{s.title}</div>
                <div className="ls-desc">{s.desc}</div>
              </div>
              {i < STEPS.length - 1 && <div className="landing-step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="landing-final-cta">
        <div className="landing-final-cta-glow" />
        <div className="landing-final-cta-inner">
          <h2 className="landing-final-title">Ready to see the market clearly?</h2>
          <p className="landing-final-sub">Free to use. No account required. Start in 10 seconds.</p>
          <button className="landing-btn-primary landing-btn-xl" onClick={launchDashboard}>
            Launch FinanceIQ Dashboard →
          </button>
          <div className="landing-final-note">
            Real-time data via Yahoo Finance · Built with FastAPI + React
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <LogoMark size={22} />
            <span>FinanceIQ</span>
            <span className="landing-beta-pill">Beta</span>
          </div>
          <div className="landing-footer-links">
            <button className="landing-footer-link" onClick={launchDashboard}>Dashboard</button>
            <span>·</span>
            <span>v1.0.0</span>
            <span>·</span>
            <span>© 2026 FinanceIQ</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
