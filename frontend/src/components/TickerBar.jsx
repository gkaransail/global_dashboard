import { useState, useEffect, useRef } from 'react'
import { useStore, TIMEFRAMES } from '../core/store'
import { api } from '../core/api'

const GROUPS = [
  { label: 'Intraday', keys: ['1h', '1d', '1w'] },
  { label: 'Swing',    keys: ['1mo', '3mo', '6mo'] },
  { label: 'Long',     keys: ['1y', '5y'] },
]

export default function TickerBar() {
  const { ticker, timeframe, setTicker, setTimeframe } = useStore()
  const [inputVal, setInputVal]   = useState(ticker)
  const [priceInfo, setPriceInfo] = useState(null)
  const [showGroups, setShowGroups] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => { setInputVal(ticker) }, [ticker])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPrice(ticker), 500)
  }, [ticker])

  async function fetchPrice(t) {
    try {
      const data = await api.get(`/reversal/quote/${t}`)
      setPriceInfo(data)
    } catch {
      setPriceInfo(null)
    }
  }

  function submit() {
    const v = inputVal.trim().toUpperCase()
    if (v && v !== ticker) setTicker(v)
  }

  const changeClass = priceInfo
    ? priceInfo.change_1d_pct >= 0 ? 'up' : 'down'
    : ''
  const changeSign = priceInfo && priceInfo.change_1d_pct >= 0 ? '+' : ''
  const activeTF = TIMEFRAMES.find(t => t.key === timeframe)

  return (
    <div className="ticker-bar">
      {/* Input */}
      <div className="ticker-bar-input-wrap">
        <span className="ticker-bar-search-icon">⌕</span>
        <input
          className="ticker-bar-input"
          value={inputVal}
          onChange={e => setInputVal(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="TICKER"
          maxLength={10}
        />
      </div>
      <button className="ticker-bar-go" onClick={submit}>Analyze</button>

      {/* Live price */}
      {priceInfo && (
        <div className="ticker-price-badge">
          <span className="ticker-price-symbol">{priceInfo.ticker}</span>
          <span className="ticker-price-value">
            ${priceInfo.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`ticker-price-change ${changeClass}`}>
            {changeSign}{priceInfo.change_1d_pct.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Timeframe pills — all 8, scrollable, grouped */}
      <div className="tf-group-wrap">
        {GROUPS.map(group => (
          <div key={group.label} className="tf-group">
            <span className="tf-group-label">{group.label}</span>
            <div className="tf-group-pills">
              {group.keys.map(key => {
                const tf = TIMEFRAMES.find(t => t.key === key)
                return (
                  <button
                    key={key}
                    className={`tf-pill ${timeframe === key ? 'active' : ''}`}
                    onClick={() => setTimeframe(key)}
                    title={`${tf.label} — ${tf.lookback}d lookback`}
                  >
                    {tf.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="ticker-bar-spacer" />

      <div className="ticker-bar-status">
        <div className="live-dot" />
        <span>Live</span>
      </div>
    </div>
  )
}
