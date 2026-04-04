/**
 * API authentication middleware.
 *
 * Validates a Bearer token on all /api/ routes (except OAuth callbacks and
 * the token bootstrap endpoint). Also checks Origin header on mutating
 * requests as lightweight CSRF protection.
 *
 * Token is auto-generated on first startup and stored in .env.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _token = null

/** Get or generate the API token */
export function getApiToken() {
  if (_token) return _token

  if (process.env.API_TOKEN) {
    _token = process.env.API_TOKEN
    return _token
  }

  // Auto-generate and persist to .env
  _token = randomBytes(32).toString('hex')
  const envPath = join(__dirname, '..', '.env')

  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf8')
    if (!existing.includes('API_TOKEN=')) {
      appendFileSync(envPath, `\n# Auto-generated API authentication token\nAPI_TOKEN=${_token}\n`)
    }
  } else {
    appendFileSync(envPath, `# Auto-generated API authentication token\nAPI_TOKEN=${_token}\n`)
  }

  process.env.API_TOKEN = _token
  console.log('Generated new API token and saved to .env')
  return _token
}

// Paths that skip auth (OAuth callback must be unauthenticated)
const SKIP_AUTH = new Set([
  '/api/spotify/login',
  '/api/spotify/callback',
  '/api/auth/token',
  '/api/import-raw',       // Bookmarklet POSTs from external origin (no token)
  '/api/bookmarklet',      // Static setup page
  '/api/bookmarklet.js',   // Bookmarklet script
])

/**
 * Express/Connect middleware that validates the API token.
 * Must be registered BEFORE API routes.
 */
export function authMiddleware(req, res, next) {
  // Only protect /api/ routes
  const url = req.url || req.originalUrl || ''
  if (!url.startsWith('/api/')) return next()

  // Skip auth for specific paths
  const path = url.split('?')[0]
  if (SKIP_AUTH.has(path)) return next()

  // Validate Bearer token
  const token = getApiToken()
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${token}`) {
    const statusCode = 401
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(statusCode).json({ error: 'Unauthorized' })
    } else {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
    }
    return
  }

  // CSRF: check Origin on mutating requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer
    if (origin) {
      const host = req.headers.host
      let originHost
      try { originHost = new URL(origin).host } catch { originHost = null }

      if (host && originHost !== host) {
        const statusCode = 403
        if (typeof res.status === 'function' && typeof res.json === 'function') {
          res.status(statusCode).json({ error: 'CSRF check failed' })
        } else {
          res.writeHead(statusCode, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'CSRF check failed' }))
        }
        return
      }
    }
  }

  next()
}
