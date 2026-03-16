import 'dotenv/config'
import open from 'open'
import defaultBrowser from 'default-browser'
import { handleSpotifyIdRequest, handlePlaylistTracks } from './spotify.js'
import { handlePopularArt } from './popularArt.js'
import { setupUGImportRoutes, setupBookmarkletRoutes } from './ugImport.js'

/** Simple GET-only route matcher for Connect/Express compatibility */
function get(server, path, handler) {
  server.use(path, (req, res, next) => {
    if (req.method !== 'GET') return next()
    handler(req, res, next)
  })
}

// --- Cached default browser detection (runs once) ---
let cachedBrowser = null

async function getDefaultBrowser() {
  if (cachedBrowser) return cachedBrowser
  try {
    const info = await defaultBrowser()                    // e.g. { name: 'Vivaldi', id: 'com.vivaldi.Vivaldi' }
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

export function setupAPI(server) {
  get(server, '/api/spotify-id', handleSpotifyIdRequest)
  get(server, '/api/playlist-tracks', handlePlaylistTracks)
  get(server, '/api/popular-art', handlePopularArt)

  get(server, '/api/open-ug', async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const query = url.searchParams.get('q')
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'q param required' }))
      return
    }
    const ugUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`
    try {
      const browser = await getDefaultBrowser()
      await open(ugUrl, { app: { name: browser.name, arguments: [browser.flag] } })
    } catch (err) {
      console.error('Failed to open browser:', err.message)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })

  // UG import + bookmarklet routes
  setupUGImportRoutes(server)
  setupBookmarkletRoutes(server, import.meta.dirname)
}
