/**
 * PM2 Ecosystem File — FinanceIQ Dashboard
 *
 * Usage:
 *   pm2 start ecosystem.config.js      # start all processes
 *   pm2 restart ecosystem.config.js    # restart all
 *   pm2 stop ecosystem.config.js       # stop all
 *   pm2 delete ecosystem.config.js     # remove from PM2
 *   pm2 logs financeiq-backend         # live logs
 *   pm2 status                         # see running processes
 */

module.exports = {
  apps: [
    {
      name: "financeiq-backend",

      // Run uvicorn directly — interpreter:"none" tells PM2 not to wrap
      // it in Node.js (PM2 normally assumes scripts are Node apps)
      script:      `${__dirname}/backend/.venv/bin/uvicorn`,
      args:        "main:app --host 0.0.0.0 --port 8000",
      interpreter: "none",

      // Run from the backend directory so relative imports work
      cwd: `${__dirname}/backend`,

      // Restart the process if it crashes
      autorestart: true,
      watch:       false,   // don't watch files in production (use restart manually)
      max_restarts: 10,
      min_uptime:   "10s",  // if it crashes before 10s, count as a failed restart

      // Environment variables (add ANTHROPIC_API_KEY here if you don't use .env)
      env: {
        PYTHONUNBUFFERED: "1",   // ensures logs appear immediately, not buffered
        PORT: "8000",
      },

      // Log files
      out_file:   `${__dirname}/logs/backend.log`,
      error_file: `${__dirname}/logs/backend-error.log`,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
}
