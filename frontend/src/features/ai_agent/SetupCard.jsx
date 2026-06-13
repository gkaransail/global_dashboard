/**
 * SetupCard — shown when the backend reports ANTHROPIC_API_KEY is not configured.
 * Looks helpful, not like an error.
 */
export default function SetupCard() {
  return (
    <div className="setup-card">
      <div className="setup-card-icon">🔑</div>
      <h3 className="setup-card-title">Enable AI Features</h3>
      <p className="setup-card-desc">
        Set your Anthropic API key to unlock AI-powered research for any ticker.
      </p>

      <div className="setup-steps">
        <div className="setup-step">
          <span className="setup-step-num">1</span>
          <div>
            <div className="setup-step-label">Add your API key to the backend environment file</div>
            <code className="setup-code">
              echo "ANTHROPIC_API_KEY=sk-ant-..." &gt;&gt; backend/.env
            </code>
          </div>
        </div>

        <div className="setup-step">
          <span className="setup-step-num">2</span>
          <div>
            <div className="setup-step-label">Restart the backend server</div>
            <code className="setup-code">
              cd backend &amp;&amp; uvicorn main:app --reload
            </code>
          </div>
        </div>

        <div className="setup-step">
          <span className="setup-step-num">3</span>
          <div>
            <div className="setup-step-label">Get an API key from Anthropic</div>
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="setup-link"
            >
              console.anthropic.com →
            </a>
          </div>
        </div>
      </div>

      <p className="setup-card-note">
        The AI features use Claude to analyse price data, technical signals, options flow,
        fundamentals, and insider activity — all fetched in real time.
      </p>
    </div>
  )
}
