export default function SetupCard() {
  return (
    <div className="setup-card">
      <div className="setup-card-icon">🔑</div>
      <h3 className="setup-card-title">Enable AI Features</h3>
      <p className="setup-card-desc">
        Set your Groq API key to unlock AI-powered research for any ticker. Groq is free — 14,400 requests/day.
      </p>

      <div className="setup-steps">
        <div className="setup-step">
          <span className="setup-step-num">1</span>
          <div>
            <div className="setup-step-label">Add your Groq API key to the backend environment file</div>
            <code className="setup-code">
              echo "GROQ_API_KEY=gsk_..." &gt;&gt; backend/.env
            </code>
          </div>
        </div>

        <div className="setup-step">
          <span className="setup-step-num">2</span>
          <div>
            <div className="setup-step-label">Restart the backend server</div>
            <code className="setup-code">
              cd backend &amp;&amp; source .venv/bin/activate &amp;&amp; uvicorn main:app --reload
            </code>
          </div>
        </div>

        <div className="setup-step">
          <span className="setup-step-num">3</span>
          <div>
            <div className="setup-step-label">Get a free API key from Groq</div>
            <a
              href="https://console.groq.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="setup-link"
            >
              console.groq.com →
            </a>
          </div>
        </div>
      </div>

      <p className="setup-card-note">
        The AI features use Groq (Llama 3.3 70B) to analyse price data, technical signals, options flow,
        fundamentals, and insider activity — all fetched in real time.
      </p>
    </div>
  )
}
