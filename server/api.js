import { readFileSync } from 'fs'
import { join } from 'path'
import { handleSpotifyIdRequest, handlePlaylistTracks } from './spotify.js'
import { handlePopularArt } from './popularArt.js'
import { setupUGImportRoutes, setupBookmarkletRoutes } from './ugImport.js'

// --- Load .env ---
export function loadEnv(rootDir) {
  try {
    const envContent = readFileSync(join(rootDir, '.env'), 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch {}
}

// --- Setup all API routes ---
export function setupAPI(server) {
  // Spotify track ID lookup
  server.use('/api/spotify-id', (req, res, next) => {
    if (req.method !== 'GET') return next()
    handleSpotifyIdRequest(req, res)
  })

  // Spotify playlist tracks
  server.use('/api/playlist-tracks', (req, res) => {
    handlePlaylistTracks(req, res)
  })

  // Popular rock album art for mosaic placeholder
  server.use('/api/popular-art', (req, res) => {
    handlePopularArt(req, res)
  })

  // Open UG in browser
  server.use('/api/open-ug', async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const query = url.searchParams.get('q')
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'q param required' }))
      return
    }
    const ugUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`
    const { exec } = await import('child_process')
    exec(`start vivaldi --new-window "${ugUrl}"`, (err) => {
      if (err) console.error('Failed to open browser:', err.message)
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })

  // UG import + bookmarklet routes
  setupUGImportRoutes(server)
  setupBookmarkletRoutes(server, import.meta.dirname)
}
