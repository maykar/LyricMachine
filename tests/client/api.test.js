import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Pinia toast store before importing api.js
vi.mock('../../src/stores/toast.js', () => {
  const showToast = vi.fn()
  return {
    useToastStore: () => ({ showToast, toasts: { value: [] }, dismissToast: vi.fn() }),
  }
})

const { api } = await import('../../src/api.js')
const { useToastStore } = await import('../../src/stores/toast.js')

// Helper: create a mock fetch that handles token bootstrap + API calls
function mockFetch(apiResponse) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    // Token bootstrap endpoint — return a fake token
    if (url === '/api/auth/token') {
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ token: 'test-token' }),
      })
    }
    // All other API calls — return the configured response
    return Promise.resolve(apiResponse)
  })
}

// Helper: get the first non-token fetch call
function getApiCall(fetchMock, index = 0) {
  const apiCalls = fetchMock.mock.calls.filter(([url]) => url !== '/api/auth/token')
  return apiCalls[index] || []
}

describe('api client', () => {
  let showToast

  beforeEach(() => {
    showToast = useToastStore().showToast
    showToast.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('successful requests', () => {
    it('getSongs returns parsed JSON', async () => {
      const songs = [{ id: 1, title: 'Test' }]
      mockFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(songs),
      })

      const result = await api.getSongs()
      expect(result).toEqual(songs)
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs')
    })

    it('createSong sends POST with JSON body', async () => {
      const created = { id: 2, title: 'New' }
      mockFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(created),
      })

      const result = await api.createSong({ title: 'New', lyrics: 'Hello' })
      expect(result).toEqual(created)
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ title: 'New', lyrics: 'Hello' })
    })

    it('updateSong sends PUT', async () => {
      mockFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      })

      await api.updateSong(5, { label: 'fresh' })
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs/5')
      expect(opts.method).toBe('PUT')
    })

    it('deleteSong sends DELETE', async () => {
      mockFetch({
        ok: true,
        headers: { get: () => '' },
      })

      await api.deleteSong(3)
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs/3')
      expect(opts.method).toBe('DELETE')
    })

    it('includes Authorization header in requests', async () => {
      mockFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve([]),
      })

      await api.getSongs()
      const [, opts] = getApiCall(fetch)
      expect(opts.headers?.Authorization).toBe('Bearer test-token')
    })
  })

  describe('error handling', () => {
    it('returns null and logs on HTTP error', async () => {
      mockFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server broke'),
      })

      const result = await api.getSongs()
      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalled()
      expect(showToast).toHaveBeenCalled()
    })

    it('returns null and logs on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        if (url === '/api/auth/token') {
          return Promise.resolve({
            ok: true,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ token: 'test-token' }),
          })
        }
        return Promise.reject(new Error('Network failed'))
      })

      const result = await api.getSongs()
      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        'Network failed'
      )
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Network error'), undefined)
    })

    it('toast message strips /api/ prefix', async () => {
      mockFetch({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })

      await api.getSetting('defaults')
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('settings/defaults'), undefined)
    })
  })

  describe('endpoint coverage', () => {
    beforeEach(() => {
      mockFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({}),
      })
    })

    it.each([
      ['getSongs', '/api/songs'],
      ['getSpotifyStatus', '/api/spotify/status'],
      ['getSpotifyToken', '/api/spotify/token'],
      ['getFilters', '/api/settings/filters'],
      ['getPlaylistTracks', '/api/playlist-tracks'],
      ['getImportChords', '/api/import-chords'],
      ['getPopularArt', '/api/popular-art'],
    ])('%s calls GET %s', async (method, url) => {
      await api[method]()
      const [calledUrl] = getApiCall(fetch)
      expect(calledUrl).toBe(url)
    })

    it('bulkUpdate sends PUT to /api/songs/bulk-update', async () => {
      await api.bulkUpdate('played', true)
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs/bulk-update')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ field: 'played', value: true })
    })

    it('clearChords sends PUT to /api/songs/clear-chords', async () => {
      await api.clearChords()
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs/clear-chords')
      expect(opts.method).toBe('PUT')
    })

    it('reorderSongs sends PUT to /api/songs/reorder', async () => {
      await api.reorderSongs([3, 1, 2])
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/songs/reorder')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ ids: [3, 1, 2] })
    })

    it('playSpotify sends PUT to /api/spotify/play with trackId and deviceId', async () => {
      await api.playSpotify({ trackId: 'abc123', deviceId: 'dev456' })
      const [url, opts] = getApiCall(fetch)
      expect(url).toBe('/api/spotify/play')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ trackId: 'abc123', deviceId: 'dev456' })
    })
  })
})
