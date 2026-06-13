import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../core/store'
import { api } from '../../core/api'
import SetupCard from './SetupCard'

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ThinkingBubble() {
  return (
    <div className="chat-message assistant">
      <div className="chat-bubble thinking">
        <span className="thinking-dots-chat">
          <span /><span /><span />
        </span>
      </div>
      <div className="chat-meta">Claude · thinking…</div>
    </div>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
        <pre className="chat-text">{msg.content}</pre>
      </div>
      <div className="chat-meta">
        {isUser ? 'You' : 'Claude'} · {formatTime(msg.timestamp)}
      </div>
    </div>
  )
}

export default function ResearchChat() {
  const ticker = useStore(s => s.ticker)
  const [messages, setMessages] = useState([])  // {role, content, timestamp}
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noApiKey, setNoApiKey] = useState(false)
  const [checkedKey, setCheckedKey] = useState(false)
  const endRef = useRef(null)
  const prevTickerRef = useRef(null)

  // Clear chat when ticker changes
  useEffect(() => {
    if (prevTickerRef.current !== null && prevTickerRef.current !== ticker) {
      setMessages([])
      setError(null)
    }
    prevTickerRef.current = ticker
  }, [ticker])

  // Check if API key is configured on first render
  useEffect(() => {
    async function checkKey() {
      try {
        const data = await api.post('/ai_agent/chat', {
          ticker,
          messages: [{ role: 'user', content: '__ping__' }],
        })
        if (data.error === 'ANTHROPIC_API_KEY not configured') {
          setNoApiKey(true)
        }
      } catch {
        // Network error — let the user try sending a message
      } finally {
        setCheckedKey(true)
      }
    }
    checkKey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, timestamp: new Date() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Send full history (without timestamps — API only wants role + content)
      const history = updatedMessages.map(m => ({ role: m.role, content: m.content }))
      const data = await api.post('/ai_agent/chat', { ticker, messages: history })

      if (data.error === 'ANTHROPIC_API_KEY not configured') {
        setNoApiKey(true)
        return
      }
      if (data.error) {
        setError(data.error)
        return
      }

      const assistantMsg = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!checkedKey) {
    return (
      <div className="pad">
        <div className="ai-loading-card">
          <div className="ai-loading-sub">Initializing…</div>
        </div>
      </div>
    )
  }

  if (noApiKey) {
    return (
      <div className="pad">
        <SetupCard />
      </div>
    )
  }

  return (
    <div className="chat-root">
      {/* Context banner */}
      <div className="chat-context-bar">
        <span>🤖 Research assistant for <strong>{ticker}</strong></span>
        <span className="chat-context-powered">Powered by Claude</span>
        {messages.length > 0 && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={() => { setMessages([]); setError(null) }}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="chat-messages-area">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">Ask anything about {ticker}</div>
            <div className="chat-empty-sub">
              Try: "What is the current price and trend?" or "Is the options market bullish or bearish?"
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && <ThinkingBubble />}

        {error && (
          <div className="chat-error-row">
            <div className="error-box">⚠ {error}</div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${ticker}… (Enter to send, Shift+Enter for newline)`}
          disabled={loading}
        />
        <button
          className="btn-primary chat-send-btn"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? '…' : '➤'}
        </button>
      </div>
    </div>
  )
}
