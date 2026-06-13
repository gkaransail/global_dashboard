// In dev: Vite proxies /api → localhost:8000
// In production (Vercel): set VITE_BACKEND_URL env var to your Render URL
const BACKEND = import.meta.env.VITE_BACKEND_URL || ''
const BASE = `${BACKEND}/api/v1`

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
}
