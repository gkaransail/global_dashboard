// section: groups features in the sidebar under a labelled header
// timeframe: 'short' | 'medium' | 'long' | 'meta'
export const FEATURES = [
  // ── ANALYSIS ──────────────────────────────────────────────────────────────
  {
    id: 'order_flow',
    label: 'Order Flow',
    icon: '🌊',
    status: 'live',
    section: 'analysis',
    timeframe: 'short',
    description: 'Intraday tape, large print scanner, absorption detection, and footprint chart.',
    subOptions: [
      { id: 'tape',         label: '📋 Tape',         icon: '📋', path: '/order_flow/tape' },
      { id: 'large_prints', label: '🐳 Large Prints',  icon: '🐳', path: '/order_flow/large_prints' },
      { id: 'footprint',    label: '👣 Footprint',     icon: '👣', path: '/order_flow/footprint' },
    ],
  },
  {
    id: 'reversal',
    label: 'Reversal Scanner',
    icon: '🔄',
    status: 'live',
    section: 'analysis',
    timeframe: 'short',
    description: 'Multi-factor reversal signal engine.',
    subOptions: [
      { id: 'analyze',   label: '🔍 Single Stock', icon: '🔍', path: '/reversal/analyze' },
      { id: 'sectors',   label: '🗂 Sector Scan',  icon: '🗂', path: '/reversal/sectors' },
      { id: 'watchlist', label: '📋 Watchlist',    icon: '📋', path: '/reversal/watchlist' },
      { id: 'macro',     label: '🌍 Macro View',   icon: '🌍', path: '/reversal/macro' },
    ],
  },
  {
    id: 'technical',
    label: 'Technical Analysis',
    icon: '📈',
    status: 'live',
    section: 'analysis',
    timeframe: 'short',
    description: 'Chart patterns, support/resistance, momentum signals.',
    subOptions: [
      { id: 'indicators', label: '📊 Indicators',         icon: '📊', path: '/technical/indicators' },
      { id: 'patterns',   label: '🔍 Chart Patterns',     icon: '🔍', path: '/technical/patterns' },
      { id: 'levels',     label: '📏 Support/Resistance', icon: '📏', path: '/technical/levels' },
      { id: 'screener',   label: '🔎 Screener',           icon: '🔎', path: '/technical/screener' },
    ],
  },
  {
    id: 'fundamental',
    label: 'Fundamental Analysis',
    icon: '🏦',
    status: 'live',
    section: 'analysis',
    timeframe: 'long',
    description: 'Valuation ratios, growth scores, financial health.',
    subOptions: [
      { id: 'valuation', label: '💹 Valuation',     icon: '💹', path: '/fundamental/valuation' },
      { id: 'growth',    label: '📈 Growth Score',  icon: '📈', path: '/fundamental/growth' },
      { id: 'health',    label: '🏥 Quality Score', icon: '🏥', path: '/fundamental/health' },
      { id: 'screener',  label: '🔎 Screener',      icon: '🔎', path: '/fundamental/screener' },
    ],
  },
  {
    id: 'options',
    label: 'Options Analysis',
    icon: '⛓',
    status: 'live',
    section: 'analysis',
    timeframe: 'short',
    description: 'Live options chain, Greeks, IV skew, unusual activity, Top 20 scanner.',
    subOptions: [
      { id: 'overview', label: '🏠 Overview',         icon: '🏠', path: '/options/overview' },
      { id: 'chain',    label: '⛓ Chain',             icon: '⛓', path: '/options/chain' },
      { id: 'unusual',  label: '🚨 Unusual Activity',  icon: '🚨', path: '/options/unusual' },
      { id: 'skew',     label: '📐 IV Skew',           icon: '📐', path: '/options/skew' },
      { id: 'scanner',  label: '🏆 Top 20',            icon: '🏆', path: '/options/scanner' },
    ],
  },

  // ── MARKET ────────────────────────────────────────────────────────────────
  {
    id: 'volume_profile',
    label: 'Volume Profile',
    icon: '📊',
    status: 'live',
    section: 'analysis',
    timeframe: 'short',
    description: 'Price-level volume histogram with POC, Value Area, VWAP, and buy/sell delta flow.',
    subOptions: [
      { id: 'profile', label: '📊 Volume Profile', icon: '📊', path: '/volume_profile/profile' },
      { id: 'delta',   label: 'Δ Delta Flow',      icon: 'Δ',  path: '/volume_profile/delta'   },
    ],
  },
  {
    id: 'earnings',
    label: 'Earnings Calendar',
    icon: '📅',
    status: 'live',
    section: 'market',
    timeframe: 'medium',
    description: 'Upcoming earnings with expected moves and EPS history.',
    subOptions: [
      { id: 'calendar', label: '📅 Calendar',          icon: '📅', path: '/earnings/calendar' },
      { id: 'analysis', label: '📊 Earnings Analysis', icon: '📊', path: '/earnings/analysis' },
    ],
  },
  {
    id: 'sentiment',
    label: 'Fear & Greed',
    icon: '🧠',
    status: 'live',
    section: 'market',
    timeframe: 'short',
    description: 'Fear & Greed index from VIX, momentum, PCR, safe haven demand, junk bonds, breadth.',
    subOptions: [
      { id: 'dashboard', label: '🧠 Dashboard', icon: '🧠', path: '/sentiment/dashboard' },
    ],
  },
  {
    id: 'sentiment_ai',
    label: 'News Sentiment',
    icon: '📰',
    status: 'live',
    section: 'market',
    timeframe: 'short',
    description: 'FinBERT-powered sentiment analysis on stock news headlines and custom text.',
    subOptions: [
      { id: 'news',    label: '📰 News Feed',     icon: '📰', path: '/sentiment_ai/news' },
      { id: 'analyze', label: '🧬 Text Analyzer', icon: '🧬', path: '/sentiment_ai/analyze' },
      { id: 'compare', label: '⚖ Compare',        icon: '⚖',  path: '/sentiment_ai/compare' },
    ],
  },

  // ── SMART DATA ────────────────────────────────────────────────────────────
  {
    id: 'insider',
    label: 'Insider Tracker',
    icon: '👁',
    status: 'live',
    section: 'smart_data',
    timeframe: 'medium',
    description: 'SEC Form 4 insider buying and selling — open market purchases and cluster signals.',
    subOptions: [
      { id: 'feed',    label: '📋 Transaction Feed', icon: '📋', path: '/insider/feed' },
      { id: 'cluster', label: '🎯 Cluster Buys',     icon: '🎯', path: '/insider/cluster' },
    ],
  },
  {
    id: 'congress',
    label: 'Congress Tracker',
    icon: '🏛',
    status: 'live',
    section: 'smart_data',
    timeframe: 'medium',
    description: 'Congressional stock trades — STOCK Act disclosures from House and Senate members.',
    subOptions: [
      { id: 'feed',    label: '📋 Trade Feed',  icon: '📋', path: '/congress/feed' },
      { id: 'members', label: '👤 Top Members', icon: '👤', path: '/congress/members' },
      { id: 'tickers', label: '🔥 Hot Tickers', icon: '🔥', path: '/congress/tickers' },
    ],
  },
  {
    id: 'institutional',
    label: '13F Holdings',
    icon: '🏢',
    status: 'live',
    section: 'smart_data',
    timeframe: 'long',
    description: 'Institutional ownership from 13F filings — top holders, position changes, fund flow.',
    subOptions: [
      { id: 'holders',  label: '🏢 Top Holders', icon: '🏢', path: '/institutional/holders' },
      { id: 'flow',     label: '🌊 Fund Flow',   icon: '🌊', path: '/institutional/flow' },
      { id: 'screener', label: '🔎 Screener',    icon: '🔎', path: '/institutional/screener' },
    ],
  },

  // ── RANKINGS ──────────────────────────────────────────────────────────────
  {
    id: 'market_intel',
    label: 'Stock Rankings',
    icon: '🎯',
    status: 'live',
    section: 'rankings',
    timeframe: 'short',
    description: 'Multi-factor stock rankings — options flow, smart money, insider, and market overview.',
    subOptions: [
      { id: 'scan',        label: '🎯 Ranked Picks',    icon: '🎯', path: '/market_intel/scan' },
      { id: 'smart_money', label: '💰 Smart Money',     icon: '💰', path: '/market_intel/smart_money' },
      { id: 'market',      label: '🌐 Market Overview', icon: '🌐', path: '/market_intel/market' },
    ],
  },
  {
    id: 'screener',
    label: 'Multi-Factor Screener',
    icon: '🔭',
    status: 'live',
    section: 'rankings',
    timeframe: 'medium',
    description: 'Unified screener combining technical, fundamental, smart money, and sentiment signals.',
    subOptions: [
      { id: 'screen',    label: '🔭 Screener',    icon: '🔭', path: '/screener/screen' },
      { id: 'score',     label: '🎯 Single Score', icon: '🎯', path: '/screener/score' },
      { id: 'scheduler', label: '⏰ Scheduler',    icon: '⏰', path: '/screener/scheduler' },
    ],
  },

  // ── BACKTEST ──────────────────────────────────────────────────────────────
  {
    id: 'backtest',
    label: 'Backtest & RL',
    icon: '🧠',
    status: 'live',
    section: 'ai',
    timeframe: 'medium',
    description: 'Track options signal predictions, evaluate outcomes, and use RL to optimize signal weights.',
    subOptions: [
      { id: 'dashboard', label: '🧠 Dashboard', icon: '🧠', path: '/backtest/dashboard' },
    ],
  },
  {
    id: 'quant',
    label: 'Quant Workbench',
    icon: '🧮',
    status: 'live',
    section: 'ai',
    timeframe: 'meta',
    description: 'Apply quantitative models (regime detection, momentum, mean reversion) to any stock.',
    subOptions: [
      { id: 'analyze', label: '🧮 Model Workbench', icon: '🧮', path: '/quant' },
    ],
  },
  {
    id: 'leaderboard',
    label: 'Signal Leaderboard',
    icon: '🏆',
    status: 'live',
    section: 'ai',
    timeframe: 'medium',
    description: 'Compare weekly/monthly Top-20 picks from Options, Technical, Insider, and Institutional signals.',
    subOptions: [
      { id: 'results',    label: '🏆 Results',    icon: '🏆', path: '/leaderboard' },
      { id: 'comparison', label: '⚖️ Comparison', icon: '⚖️', path: '/leaderboard' },
      { id: 'picks',      label: '📋 All Picks',  icon: '📋', path: '/leaderboard' },
    ],
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    id: 'ai_agent',
    label: 'AI Research Agent',
    icon: '🤖',
    status: 'live',
    section: 'ai',
    timeframe: 'meta',
    description: 'AI-powered research — summaries, deep analysis, interactive chat, Bull vs Bear debate.',
    subOptions: [
      { id: 'summary',  label: '📝 AI Summary',   icon: '📝', path: '/ai_agent/summary' },
      { id: 'research', label: '🔬 Deep Research', icon: '🔬', path: '/ai_agent/research' },
      { id: 'chat',     label: '💬 Research Chat', icon: '💬', path: '/ai_agent/chat' },
      { id: 'debate',   label: '⚔ Bull vs Bear',  icon: '⚔',  path: '/ai_agent/debate' },
    ],
  },

  // ── PORTFOLIO ─────────────────────────────────────────────────────────────
  {
    id: 'portfolio',
    label: 'Portfolio Tracker',
    icon: '💼',
    status: 'live',
    section: 'portfolio',
    timeframe: 'long',
    description: 'Track positions, cost basis, unrealized P&L, and portfolio allocation.',
    subOptions: [
      { id: 'holdings', label: '💼 Holdings',    icon: '💼', path: '/portfolio/holdings' },
      { id: 'summary',  label: '📊 P&L Summary', icon: '📊', path: '/portfolio/summary' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts & Watchlist',
    icon: '🔔',
    status: 'live',
    section: 'portfolio',
    timeframe: 'short',
    description: 'Price alerts and watchlist with signal notifications.',
    subOptions: [
      { id: 'watchlist', label: '👁 Watchlist',    icon: '👁', path: '/alerts/watchlist' },
      { id: 'alerts',    label: '🔔 Price Alerts', icon: '🔔', path: '/alerts/alerts' },
    ],
  },
]

export const SECTION_LABELS = {
  analysis:   'Analysis',
  market:     'Market',
  smart_data: 'Smart Data',
  rankings:   'Rankings',
  ai:         'AI',
  portfolio:  'Portfolio',
}

export const TIMEFRAME_META = {
  short:  { label: 'Short',  sublabel: 'Days–2 weeks',  color: '#f59e0b', icon: '⚡' },
  medium: { label: 'Medium', sublabel: '2 weeks–3 months', color: '#38bdf8', icon: '🕐' },
  long:   { label: 'Long',   sublabel: 'Months–years',  color: '#34d399', icon: '📅' },
  meta:   { label: 'Meta',   sublabel: 'All horizons',  color: '#c084fc', icon: '🔮' },
}
