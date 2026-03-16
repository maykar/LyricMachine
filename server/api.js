import 'dotenv/config'
import open from 'open'
import defaultBrowser from 'default-browser'
import * as db from './db.js'
import { handleSpotifyIdRequest, handlePlaylistTracks } from './spotify.js'
import { handlePopularArt } from './popularArt.js'
import { setupUGImportRoutes, setupBookmarkletRoutes } from './ugImport.js'

// --- Validate required env vars at startup ---
const requiredEnv = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']
const missing = requiredEnv.filter(k => !process.env[k])
if (missing.length) {
  console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`)
  console.error('   Copy .env.example to .env and fill in your Spotify credentials.\n')
  process.exit(1)
}

// --- Route helpers for Connect/Express compatibility ---

function route(server, method, path, handler) {
  server.use(path, (req, res, next) => {
    if (req.method !== method) return next()
    handler(req, res, next)
  })
}

function get(server, path, handler) { route(server, 'GET', path, handler) }
function post(server, path, handler) { route(server, 'POST', path, handler) }
function put(server, path, handler) { route(server, 'PUT', path, handler) }
function del(server, path, handler) { route(server, 'DELETE', path, handler) }

/** Parse JSON body from request (works with both Connect and Express) */
export function parseBody(req) {
  // If express.json() already parsed it
  if (req.body) return Promise.resolve(req.body)
  // Manual parse for Connect (Vite dev)
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

/** Send JSON response */
export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Extract ID from URL path like /api/songs/42 */
function extractId(req) {
  const parts = req.url.split('/')
  return parseInt(parts[parts.length - 1], 10)
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

  // ===== Songs CRUD =====

  get(server, '/api/songs', (req, res) => {
    json(res, db.getAllSongs())
  })

  // POST /api/songs — create or upsert a song
  post(server, '/api/songs', async (req, res) => {
    try {
      const body = await parseBody(req)
      if (!body.title) return json(res, { error: 'title required' }, 400)
      const song = db.upsertSong(body)
      json(res, song, 201)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/reorder — bulk update sort_order
  put(server, '/api/songs/reorder', async (req, res) => {
    try {
      const body = await parseBody(req)
      if (!Array.isArray(body.ids)) return json(res, { error: 'ids array required' }, 400)
      db.reorderSongs(body.ids)
      json(res, { ok: true })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // PUT /api/songs/bulk-update — update a field on all songs
  put(server, '/api/songs/bulk-update', async (req, res) => {
    try {
      const body = await parseBody(req)
      if (!body.field) return json(res, { error: 'field required' }, 400)
      db.bulkUpdateField(body.field, body.value)
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
  get(server, '/api/songs/', (req, res) => {
    // Matches /api/songs/42 — extract ID from the remainder
    const id = extractId(req)
    if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
    const song = db.getSong(id)
    if (!song) return json(res, { error: 'not found' }, 404)
    json(res, song)
  })

  // PUT /api/songs/:id — update song fields
  put(server, '/api/songs/', async (req, res) => {
    try {
      const id = extractId(req)
      if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
      const body = await parseBody(req)
      const song = db.updateSong(id, body)
      if (!song) return json(res, { error: 'not found' }, 404)
      json(res, song)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  // DELETE /api/songs/:id
  del(server, '/api/songs/', async (req, res) => {
    const id = extractId(req)
    if (isNaN(id)) return json(res, { error: 'invalid id' }, 400)
    db.deleteSong(id)
    json(res, { ok: true })
  })

  // ===== Settings =====

  get(server, '/api/settings/', (req, res) => {
    const key = req.url.split('/').pop()
    const value = db.getSetting(key)
    json(res, value !== null ? value : {})
  })

  put(server, '/api/settings/', async (req, res) => {
    try {
      const key = req.url.split('/').pop()
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
      if (!Array.isArray(body)) return json(res, { error: 'expected array' }, 400)
      const imported = db.importFavorites(body)
      json(res, { imported, total: db.getSongCount() })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })
}
