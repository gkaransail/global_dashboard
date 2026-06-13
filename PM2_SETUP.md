# PM2 Setup — FinanceIQ Dashboard

## What PM2 Is

**PM2** (Process Manager 2) is a production process manager for Node.js — but it can manage any process, including Python. It:
- Keeps your app running after crashes (auto-restart)
- Starts your app automatically when your Mac boots
- Manages logs for every process
- Lets you monitor CPU/memory usage

**Install:** `npm install -g pm2`  
**Config file:** `ecosystem.config.js` (project root)  
**Dashboard URL after setup:** http://localhost:8000

---

## Architecture

With PM2 the frontend is **built once** (`npm run build`) and served as static files directly by the FastAPI backend. There is only **one process** to manage:

```
PM2
└── financeiq-backend (uvicorn on port 8000)
      ├── /api/v1/*         → FastAPI routes
      ├── /assets/*         → React build assets (JS/CSS)
      ├── /                 → React SPA (index.html)
      └── Background thread → APScheduler cache warm-up jobs
```

All traffic goes through port **8000**. Open http://localhost:8000 in your browser.

---

## First-Time Setup (already done)

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Build the React frontend
cd frontend && npm run build

# 3. Start the backend (serves frontend too)
cd ..   # project root
pm2 start ecosystem.config.js

# 4. Save process list so PM2 knows what to restore on boot
pm2 save

# 5. Register PM2 as a macOS launch agent (run with your password)
#    PM2 prints this exact command — copy/paste and enter your password
sudo env PATH=$PATH:/opt/homebrew/Cellar/node/26.0.0/bin \
  /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd \
  -u karankamlesh --hp /Users/karankamlesh
```

After step 5: **every time your Mac boots, PM2 starts automatically, which starts the backend, which warms the cache.** You just open your browser.

---

## Everyday Commands

```bash
# Check status of all processes
pm2 status

# Watch live logs
pm2 logs financeiq-backend

# Watch scheduler warm-up jobs firing in real time
pm2 logs financeiq-backend | grep "\[warm\]"

# Restart after code changes
pm2 restart financeiq-backend

# Stop everything
pm2 stop all

# Start again
pm2 start ecosystem.config.js
```

---

## Rebuilding the Frontend After UI Changes

The frontend is served as pre-built static files. Whenever you change React code, rebuild:

```bash
cd /Users/karankamlesh/dev_test/global_dashboard/frontend
npm run build
pm2 restart financeiq-backend   # reload so FastAPI picks up new files
```

---

## Updating the Backend After Python Changes

```bash
pm2 restart financeiq-backend
```

PM2 sends SIGINT to the old process (triggering FastAPI's graceful shutdown → scheduler drain), then starts a fresh one.

---

## ecosystem.config.js Explained

```js
module.exports = {
  apps: [{
    name:        "financeiq-backend",
    script:      "/path/to/.venv/bin/uvicorn",  // full path to uvicorn binary
    args:        "main:app --host 0.0.0.0 --port 8000",
    interpreter: "none",    // tells PM2: run this binary directly, not as Node
    cwd:         "/path/to/backend",  // working directory (so imports resolve)
    autorestart: true,      // restart if it crashes
    max_restarts: 10,       // give up after 10 consecutive crashes
    min_uptime:  "10s",     // crash before 10s counts as a failed restart
    env: {
      PYTHONUNBUFFERED: "1",  // logs appear immediately (not buffered)
    },
    out_file:   "logs/backend.log",
    error_file: "logs/backend-error.log",
  }]
}
```

Key field: **`interpreter: "none"`** — without this, PM2 assumes the script is a Node.js file and tries to `require()` the uvicorn binary, which causes a syntax error.

---

## Log Files

| File | Contains |
|------|----------|
| `logs/backend.log` | stdout — uvicorn startup, request logs, scheduler `[warm]` messages |
| `logs/backend-error.log` | stderr — Python exceptions, import errors |

View with:
```bash
tail -f logs/backend.log          # live backend output
pm2 logs financeiq-backend        # same, via PM2
```

---

## How Auto-Start Works on macOS

PM2 uses **launchd** (macOS's native service manager) to register a launch agent at:
```
~/Library/LaunchAgents/com.karankamlesh.pm2.plist
```

When you log into your Mac, launchd reads this file and starts the PM2 daemon. PM2 reads its saved process list (`~/.pm2/dump.pm2`) and starts all saved processes — including `financeiq-backend`.

```
Mac login
  → launchd reads ~/Library/LaunchAgents/com.karankamlesh.pm2.plist
    → starts PM2 daemon
      → PM2 reads ~/.pm2/dump.pm2
        → starts financeiq-backend (uvicorn on :8000)
          → FastAPI starts, scheduler fires first warm-up jobs
            → http://localhost:8000 is live
```

**Important:** `pm2 save` must be run after any change to the process list (adding/removing apps) for it to persist across reboots.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pm2 status` shows `errored` | Run `pm2 logs financeiq-backend` to see the error |
| Port 8000 already in use | `pkill -f uvicorn` then `pm2 restart financeiq-backend` |
| Frontend shows old version | `cd frontend && npm run build` then `pm2 restart financeiq-backend` |
| Dashboard not at localhost:8000 | `pm2 status` — if stopped, `pm2 start ecosystem.config.js && pm2 save` |
| Startup script lost after Node upgrade | Re-run the `pm2 startup` + `sudo` command and `pm2 save` again |
| Want to stop auto-start | `pm2 unstartup launchd` |

---

## Network Access (same WiFi)

The backend binds to `0.0.0.0` so it's accessible from any device on your local network:

```bash
# Find your Mac's local IP
ipconfig getifaddr en0

# Then on phone/tablet: http://<that-ip>:8000
```
