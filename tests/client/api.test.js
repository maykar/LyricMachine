import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock useToast before importing api.js
vi.mock('../../src/composables/useToast.js', () => {
  const showToast = vi.fn()
  return {
    useToast: () => ({ showToast, toasts: { value: [] }, dismissToast: vi.fn() }),
  }
})

const { api } = await import('../../src/api.js')
const { useToast } = await import('../../src/composables/useToast.js')

describe('api client', () => {
  let showToast

  beforeEach(() => {
    showToast = useToast().showToast
    showToast.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('successful requests', () => {
    it('getSongs returns parsed JSON', async () => {
      const songs = [{ id: 1, title: 'Test' }]
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(songs),
      })

      const result = await api.getSongs()
      expect(result).toEqual(songs)
      expect(fetch).toHaveBeenCalledWith('/api/songs', {})
    })

    it('createSong sends POST with JSON body', async () => {
      const created = { id: 2, title: 'New' }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(created),
      })

      const result = await api.createSong({ title: 'New', lyrics: 'Hello' })
      expect(result).toEqual(created)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ title: 'New', lyrics: 'Hello' })
    })

    it('updateSong sends PUT', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      })

      await api.updateSong(5, { label: 'fresh' })
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs/5')
      expect(opts.method).toBe('PUT')
    })

    it('deleteSong sends DELETE', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => '' },
      })

      await api.deleteSong(3)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs/3')
      expect(opts.method).toBe('DELETE')
    })
  })

  describe('error handling', () => {
    it('returns null and logs on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failed'))

      const result = await api.getSongs()
      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        'Network failed'
      )
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Network error'))
    })

    it('toast message strips /api/ prefix', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })

      await api.getSetting('defaults')
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('settings/defaults'))
    })
  })

  describe('endpoint coverage', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({}),
      })
    })

    it.each([
      ['getSongs', '/api/songs'],
      ['getSpotifyStatus', '/api/spotify/status'],
      ['getFilters', '/api/settings/filters'],
      ['getPlaylistTracks', '/api/playlist-tracks'],
      ['getImportChords', '/api/import-chords'],
      ['getPopularArt', '/api/popular-art'],
    ])('%s calls GET %s', async (method, url) => {
      await api[method]()
      expect(fetch).toHaveBeenCalledWith(url, {})
    })

    it('bulkUpdate sends PUT to /api/songs/bulk-update', async () => {
      await api.bulkUpdate('played', true)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs/bulk-update')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ field: 'played', value: true })
    })

    it('clearChords sends PUT to /api/songs/clear-chords', async () => {
      await api.clearChords()
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs/clear-chords')
      expect(opts.method).toBe('PUT')
    })

    it('reorderSongs sends PUT to /api/songs/reorder', async () => {
      await api.reorderSongs([3, 1, 2])
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/songs/reorder')
      expect(opts.method).toBe('PUT')
      expect(JSON.parse(opts.body)).toEqual({ ids: [3, 1, 2] })
    })
  })
})
