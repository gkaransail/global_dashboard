import { create } from 'zustand'

// Timeframe definitions used across the whole app
export const TIMEFRAMES = [
  { key: '1h',  label: '1H',  lookback: 7,    group: 'short'  },
  { key: '1d',  label: '1D',  lookback: 14,   group: 'short'  },
  { key: '1w',  label: '1W',  lookback: 30,   group: 'short'  },
  { key: '1mo', label: '1M',  lookback: 30,   group: 'medium' },
  { key: '3mo', label: '3M',  lookback: 90,   group: 'medium' },
  { key: '6mo', label: '6M',  lookback: 180,  group: 'medium' },
  { key: '1y',  label: '1Y',  lookback: 365,  group: 'long'   },
  { key: '5y',  label: '5Y',  lookback: 1825, group: 'long'   },
]

export function lookbackForTimeframe(tfKey) {
  return TIMEFRAMES.find(t => t.key === tfKey)?.lookback ?? 90
}

export const useStore = create((set) => ({
  ticker: 'AAPL',
  timeframe: '3mo',
  watchlist: ['AAPL', 'TSLA', 'NVDA', 'SPY', 'MSFT'],

  setTicker: (ticker) => set({ ticker: ticker.toUpperCase() }),
  setTimeframe: (timeframe) => set({ timeframe }),
  addToWatchlist: (ticker) =>
    set((s) => ({
      watchlist: s.watchlist.includes(ticker.toUpperCase())
        ? s.watchlist
        : [...s.watchlist, ticker.toUpperCase()],
    })),
  removeFromWatchlist: (ticker) =>
    set((s) => ({ watchlist: s.watchlist.filter((t) => t !== ticker) })),
}))
