// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * API route handler tests.
 *
 * We test the route handlers by creating a minimal mock server,
 * registering the routes via setupAPI, then calling them with mock req/res.
 * This avoids the need for supertest while testing real handler logic.
 *
 * db.js is mocked to isolate route handler logic from SQLite.
 */

vi.mock('../../server/db.js', () => ({
  getAllSongs: vi.fn(() => []),
  getSong: vi.fn(),
  getSongByTitle: vi.fn(),
  getSongCount: vi.fn(() => 0),
  createSong: vi.fn(),
  upsertSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
  reorderSongs: vi.fn(),
  bulkUpdateField: vi.fn(),
  clearAllChords: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  importFavorites: vi.fn(),
}))

// Mock external modules that have side effects
vi.mock('../../server/spotify.js', () => ({
  handleSpotifyIdRequest: vi.fn(),
  handlePlaylistTracks: vi.fn(),
  getSpotifyToken: vi.fn(),
}))
vi.mock('../../server/popularArt.js', () => ({
  handlePopularArt: vi.fn(),
}))
vi.mock('../../server/ugImport.js', () => ({
  setupUGImportRoutes: vi.fn(),
  setupBookmarkletRoutes: vi.fn(),
}))
vi.mock('../../server/spotifyAuth.js', () => ({
  setupSpotifyAuthRoutes: vi.fn(),
  getUserToken: vi.fn(),
}))
vi.mock('../../server/spotifyPlaylists.js', () => ({
  setupSpotifyPlaylistRoutes: vi.fn(),
}))
vi.mock('open', () => ({ default: vi.fn() }))
vi.mock('default-browser', () => ({ default: vi.fn(() => Promise.resolve({ name: 'chrome' })) }))

const db = await import('../../server/db.js')
const { setupAPI, parseBody, json } = await import('../../server/api.js')

// --- Test helpers ---

/** Build a minimal mock server that captures registered route handlers */
function createMockServer() {
  const routes = []

  const server = {
    use(path, handler) {
      routes.push({ path, handler })
    },
  }

  /** Find and call a registered route handler */
  async function callRoute(method, path, body = null) {
    // Build mock req
    const req = new EventEmitter()
    req.method = method
    req.url = path.replace(/^\/api\/[^/]+/, '') || '/' // Extract the path suffix after the route prefix

    // For routes that use path matching
    const fullUrl = path

    const res = createMockRes()

    // Find matching route handler by checking all routes
    for (const r of routes) {
      if (fullUrl.startsWith(r.path) || fullUrl === r.path) {
        // Adjust req.url to be the suffix after the route prefix
        req.url = fullUrl.slice(r.path.length) || '/'
        if (body !== null) {
          req.body = body // Pre-parsed body
        }

        let nextCalled = false
        const next = () => { nextCalled = true }

        await r.handler(req, res, next)
        if (!nextCalled) return res
      }
    }
    return res
  }

  return { server, routes, callRoute }
}

function createMockRes() {
  const res = {
    _status: null,
    _headers: {},
    _body: null,
    writeHead(status, headers) {
      res._status = status
      res._headers = { ...res._headers, ...headers }
    },
    end(data) {
      if (data) res._body = JSON.parse(data)
    },
    status(code) { res._status = code; return res },
    json(data) { res._body = data },
  }
  return res
}

describe('API route handlers', () => {
  let mock

  beforeEach(() => {
    vi.clearAllMocks()
    mock = createMockServer()
    setupAPI(mock.server)
  })

  describe('GET /api/songs', () => {
    it('returns all songs', async () => {
      const songs = [{ id: 1, title: 'Test' }]
      db.getAllSongs.mockReturnValue(songs)

      const res = await mock.callRoute('GET', '/api/songs')
      expect(res._body).toEqual(songs)
    })

    it('returns 500 on error', async () => {
      db.getAllSongs.mockImplementation(() => { throw new Error('DB error') })

      const res = await mock.callRoute('GET', '/api/songs')
      expect(res._body.error).toBe('DB error')
    })
  })

  describe('POST /api/songs', () => {
    it('creates a song', async () => {
      const song = { id: 1, title: 'New Song' }
      db.upsertSong.mockReturnValue(song)

      const res = await mock.callRoute('POST', '/api/songs', { title: 'New Song', lyrics: 'Hello' })
      expect(db.upsertSong).toHaveBeenCalledWith({ title: 'New Song', lyrics: 'Hello' })
    })

    it('returns 400 when title is missing', async () => {
      const res = await mock.callRoute('POST', '/api/songs', { lyrics: 'no title' })
      expect(res._body.error).toBe('title required')
    })
  })

  describe('PUT /api/songs/reorder', () => {
    it('reorders songs', async () => {
      await mock.callRoute('PUT', '/api/songs/reorder', { ids: [3, 1, 2] })
      expect(db.reorderSongs).toHaveBeenCalledWith([3, 1, 2])
    })

    it('returns 400 when ids is not an array', async () => {
      const res = await mock.callRoute('PUT', '/api/songs/reorder', { ids: 'not-array' })
      expect(res._body.error).toBe('ids array required')
    })
  })

  describe('PUT /api/songs/bulk-update', () => {
    it('updates a field on all songs', async () => {
      db.bulkUpdateField.mockReturnValue({ ok: true })
      const res = await mock.callRoute('PUT', '/api/songs/bulk-update', { field: 'played', value: true })
      expect(db.bulkUpdateField).toHaveBeenCalledWith('played', true)
      expect(res._body.ok).toBe(true)
    })

    it('returns 400 when field is missing', async () => {
      const res = await mock.callRoute('PUT', '/api/songs/bulk-update', { value: true })
      expect(res._body.error).toBe('field required')
    })

    it('returns 400 for unknown field', async () => {
      db.bulkUpdateField.mockReturnValue({ ok: false, error: 'Unknown field: fake' })
      const res = await mock.callRoute('PUT', '/api/songs/bulk-update', { field: 'fake', value: true })
      expect(res._body.error).toContain('Unknown field')
    })
  })

  describe('PUT /api/songs/clear-chords', () => {
    it('clears all chords', async () => {
      const res = await mock.callRoute('PUT', '/api/songs/clear-chords', {})
      expect(db.clearAllChords).toHaveBeenCalled()
      expect(res._body.ok).toBe(true)
    })
  })

  describe('POST /api/import', () => {
    it('imports an array of songs', async () => {
      db.importFavorites.mockReturnValue(3)
      db.getSongCount.mockReturnValue(10)

      const res = await mock.callRoute('POST', '/api/import', [
        { title: 'A' }, { title: 'B' }, { title: 'C' },
      ])
      expect(db.importFavorites).toHaveBeenCalledWith([
        { title: 'A' }, { title: 'B' }, { title: 'C' },
      ])
      expect(res._body).toEqual({ imported: 3, total: 10 })
    })

    it('returns 400 when body is not an array', async () => {
      const res = await mock.callRoute('POST', '/api/import', { not: 'array' })
      expect(res._body.error).toBe('expected array')
    })
  })
})

describe('parseBody', () => {
  it('returns pre-parsed body', async () => {
    const req = { body: { key: 'value' } }
    const result = await parseBody(req)
    expect(result).toEqual({ key: 'value' })
  })
})

describe('json helper', () => {
  it('sends JSON via Express-style res', () => {
    const res = {
      _status: null,
      _body: null,
      status(code) { res._status = code; return res },
      json(data) { res._body = data },
    }
    json(res, { hello: 'world' }, 201)
    expect(res._status).toBe(201)
    expect(res._body).toEqual({ hello: 'world' })
  })

  it('sends JSON via Connect-style res (writeHead + end)', () => {
    let written = ''
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(data => { written = data }),
    }
    json(res, { data: 'ok' })
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' })
    expect(JSON.parse(written)).toEqual({ data: 'ok' })
  })
})
