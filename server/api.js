import 'dotenv/config'
import open from 'open'
import defaultBrowser from 'default-browser'
import * as db from './db.js'
import { validate, SongCreateSchema, SongUpdateSchema, ReorderSchema, BulkUpdateSchema, ImportSchema } from './validation.js'
import { handleSpotifyIdRequest, handlePlaylistTracks } from './spotify.js'
import { handlePopularArt } from './popularArt.js'
import { setupUGImportRoutes, setupBookmarkletRoutes } from './ugImport.js'
import { setupSpotifyAuthRoutes } from './spotifyAuth.js'
import { setupSpotifyPlaylistRoutes } from './spotifyPlaylists.js'

// --- Warn on missing Spotify env vars (non-fatal) ---
const spotifyEnv = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']
const missing = spotifyEnv.filter(k => !process.env[k])
if (missing.length) {
  console.warn(`\n⚠️  Missing Spotify credentials: ${missing.join(', ')}`)
  console.warn('   Spotify features will be disabled. Copy .env.example to .env to configure.\n')
}

// --- Route helpers for Connect/Express compatibility ---

function route(server, method, path, handler) {
  server.use(path, (req, res, next) => {
    if (req.method !== method) return next()
    handler(req, res, next)
  })
}

export function get(server, path, handler) { route(server, 'GET', path, handler) }
export function post(server, path, handler) { route(server, 'POST', path, handler) }
export function put(server, path, handler) { route(server, 'PUT', path, handler) }
export function del(server, path, handler) { route(server, 'DELETE', path, handler) }

/** Parse JSON body from request (works with both Connect and Express) */
const MAX_BODY = 10 * 1024 * 1024 // 10 MB — matches express.json({ limit: '10mb' })

export function parseBody(req) {
  // If express.json() already parsed it
  if (req.body) return Promise.resolve(req.body)
  // Manual parse for Connect (Vite dev)
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      data += chunk
    })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

/** Send JSON response (Connect + Express compatible) */
export function json(res, data, status = 200) {
  // Prefer Express native json() when available (enables middleware hooks)
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(data)
  } else {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }
}

/** Extract numeric ID from URL path relative to mount point (e.g., /42) */
function extractId(req) {
  const path = req.url.split('?')[0].replace(/\/+$/, '')
  const match = path.match(/^\/(\d+)$/)
  return match ? parseInt(match[1], 10) : NaN
}

// --- Cached default browser detection (runs once) ---
let cachedBrowser = null

async function getDefaultBrowser() {
  if (cachedBrowser) return cachedBrowser
  try {
    const info = await defaultBrowser()
    const name = info.name.toLowerCase()
    const flag = name.includes('firefox') ? '-new-window' : '--new-window'
    cachedBrowser = { name: info.name, flag }
    console.log(`Default browser detected: ${info.name}`)
    return cachedBrowser
  } catch {
    cachedBrowser = { name: 'chrome', flag: '--new-window' }
    return cachedBrowser
  }
}

// --- Setup all API routes ---
export function setupAPI(server) {

  // ===== Existing routes =====
  get(server, '/api/spotify-id', handleSpotifyIdRequest)
  get(server, '/api/playlist-tracks', handlePlaylistTracks)
  get(server, '/api/popular-art', handlePopularArt)

  get(server, '/api/open-ug', async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const query = url.searchParams.get('q')
    if (!query) return json(res, { error: 'q param required' }, 400)

    const ugUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`
    try {
      const browser = await getDefaultBrowser()
      await open(ugUrl, { app: { name: browser.name, arguments: [browser.flag] } })
    } catch (err) {
      console.error('Failed to open browser:', err.message)
    }
    json(res, { ok: true })
  })

  // UG import + bookmarklet routes
  setupUGImportRoutes(server)
  setupBookmarkletRoutes(server, import.meta.dirname)

  // Spotify auth + playlist routes
  setupSpotifyAuthRoutes(server, { get, post, put, json, parseBody })
  setupSpotifyPlaylistRoutes(server, { get, post, json, parseBody })

  // ===== Songs CRUD =====

  get(server, '/api/songs/summary', (req, res, next) => {
    // Strictly match /api/songs/summary with no extra path segments after it
    const clean = req.url.split('?')[0].replace(/\/+$/, '')
    if (clean !== '' && clean !== '/') return next()
    try {
      json(res, db.getSongsSummary())
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  get(server, '/api/songs', (req, res, next) => {
    // If there's an ID, skip to the single-song route below
    if (!isNaN(extractId(req))) return next()
    // Otherwise it's the list route (allows query strings)
    if (req.url !== '/' && req.url !== '' && !req.url.startsWith('?')) {
      // Summary or future sub-routes
      return next()
    }
    
    try {
      json(res, db.getAllSongs())
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // POST /api/songs — create or upsert a song
  post(server, '/api/songs', async (req, res) => {
    try {
      const body = await parseBody(req)
      const { data, error } = validate(SongCreateSchema, body)
      if (error) return json(res, { error }, 400)
      const song = db.upsertSong(data)
      json(res, song, 201)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/reorder — bulk update sort_order
  put(server, '/api/songs/reorder', async (req, res) => {
    try {
      const body = await parseBody(req)
      const { data, error } = validate(ReorderSchema, body)
      if (error) return json(res, { error }, 400)
      db.reorderSongs(data.ids)
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/bulk-update — update a field on all songs
  put(server, '/api/songs/bulk-update', async (req, res) => {
    try {
      const body = await parseBody(req)
      const { data, error } = validate(BulkUpdateSchema, body)
      if (error) return json(res, { error }, 400)
      const result = db.bulkUpdateField(data.field, data.value)
      if (!result.ok) return json(res, { error: result.error }, 400)
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/clear-chords — clear all chord data
  put(server, '/api/songs/clear-chords', async (req, res) => {
    try {
      db.clearAllChords()
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // GET /api/songs/:id — must be AFTER the named routes above
  get(server, '/api/songs', (req, res) => {
    try {
      // Matches /api/songs/42 — extract ID from the remainder
      const id = extractId(req)
      if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
      const song = db.getSong(id)
      if (!song) return json(res, { error: 'not found' }, 404)
      json(res, song)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/:id — update song fields
  put(server, '/api/songs', async (req, res) => {
    try {
      const id = extractId(req)
      if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
      const body = await parseBody(req)
      const { data, error } = validate(SongUpdateSchema, body)
      if (error) return json(res, { error }, 400)
      const song = db.updateSong(id, data)
      if (!song) return json(res, { error: 'not found' }, 404)
      json(res, song)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // DELETE /api/songs/:id
  del(server, '/api/songs', async (req, res) => {
    try {
      const id = extractId(req)
      if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
      db.deleteSong(id)
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // ===== Settings =====

  get(server, '/api/settings', (req, res) => {
    // req.url is the path relative to the /api/settings mount point, e.g. '/defaults'
    const key = new URL(req.url, 'http://localhost').pathname.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!key) return json(res, { error: 'settings key required' }, 400)
    const value = db.getSetting(key)
    json(res, value !== null ? value : {})
  })

  put(server, '/api/settings', async (req, res) => {
    try {
      const key = new URL(req.url, 'http://localhost').pathname.replace(/^\/+/, '').replace(/\/+$/, '')
      if (!key) return json(res, { error: 'settings key required' }, 400)
      const body = await parseBody(req)
      db.setSetting(key, body)
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // ===== Export/Import =====

  get(server, '/api/export', (req, res) => {
    const songs = db.getAllSongs()
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="lyricmachine-favorites.json"',
    })
    res.end(JSON.stringify(songs, null, 2))
  })

  post(server, '/api/import', async (req, res) => {
    try {
      const body = await parseBody(req)
      const { data, error } = validate(ImportSchema, body)
      if (error) return json(res, { error }, 400)
      const imported = db.importFavorites(data)
      json(res, { imported, total: db.getSongCount() })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })
}
