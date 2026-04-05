import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for usePlaylistSync composable.
 */

vi.mock('../../src/api.js', () => ({
  api: {
    getPlaylistTracks: vi.fn(),
    createSong: vi.fn(),
    updateSong: vi.fn(),
    getSpotifyId: vi.fn(),
  },
}))

vi.mock('../../src/utils/normalize.js', async () => {
  const actual = await vi.importActual('../../shared/normalize.js')
  return actual
})

const { api } = await import('../../src/api.js')
const { usePlaylistSync } = await import('../../src/composables/usePlaylistSync.js')

describe('usePlaylistSync', () => {
  let sync, favorites, userDefaults

  beforeEach(() => {
    setActivePinia(createPinia())
    favorites = ref([])
    userDefaults = ref({ merge: false, separators: false, altColors: true })
    sync = usePlaylistSync(favorites, userDefaults)
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('syncPlaylist', () => {
    it('does nothing when API returns null', async () => {
      api.getPlaylistTracks.mockResolvedValue(null)
      await sync.syncPlaylist()
      expect(api.createSong).not.toHaveBeenCalled()
    })

    it('does nothing when API returns empty tracks', async () => {
      api.getPlaylistTracks.mockResolvedValue({ tracks: [] })
      await sync.syncPlaylist()
      expect(api.createSong).not.toHaveBeenCalled()
    })

    it('skips tracks already in favorites (normalized comparison)', async () => {
      favorites.value = [{ title: "Foo Fighters — Monkey Wrench" }]
      api.getPlaylistTracks.mockResolvedValue({
        tracks: [{ title: "Foo Fighters — Monkey Wrench", artist: 'Foo Fighters', track: 'Monkey Wrench' }],
      })

      await sync.syncPlaylist()
      expect(api.createSong).not.toHaveBeenCalled()
    })

    it('creates new songs for tracks not in favorites', async () => {
      api.getPlaylistTracks.mockResolvedValue({
        tracks: [
          { title: 'Artist — New Song', artist: 'Artist', track: 'New Song', spotifyTrackId: 'sp1', albumArt: 'art.jpg' },
        ],
      })
      api.createSong.mockResolvedValue({ id: 1, title: 'Artist — New Song' })

      await sync.syncPlaylist()
      expect(api.createSong).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Artist — New Song',
        spotifyTrackId: 'sp1',
        albumArt: 'art.jpg',
        merge: false,
        separators: false,
        altColors: true,
      }))
    })

    it('adds created songs to favorites array', async () => {
      api.getPlaylistTracks.mockResolvedValue({
        tracks: [{ title: 'A — B', artist: 'A', track: 'B' }],
      })
      const created = { id: 1, title: 'A — B' }
      api.createSong.mockResolvedValue(created)

      await sync.syncPlaylist()
      expect(favorites.value).toContainEqual(created)
    })

    it('applies user defaults to new songs', async () => {
      userDefaults.value = { merge: true, separators: true, altColors: false }
      api.getPlaylistTracks.mockResolvedValue({
        tracks: [{ title: 'X — Y', artist: 'X', track: 'Y' }],
      })
      api.createSong.mockResolvedValue({ id: 1 })

      await sync.syncPlaylist()
      expect(api.createSong).toHaveBeenCalledWith(expect.objectContaining({
        merge: true,
        separators: true,
        altColors: false,
      }))
    })

    it('handles API failure gracefully', async () => {
      api.getPlaylistTracks.mockRejectedValue(new Error('API down'))
      await sync.syncPlaylist() // should not throw
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('backfillAlbumArt', () => {
    it('does nothing when all songs have album art', async () => {
      favorites.value = [{ title: 'A — B', albumArt: 'exists.jpg' }]
      await sync.backfillAlbumArt()
      expect(api.getSpotifyId).not.toHaveBeenCalled()
    })

    it('skips songs without separator in title', async () => {
      favorites.value = [{ title: 'No Separator' }]
      await sync.backfillAlbumArt()
      expect(api.getSpotifyId).not.toHaveBeenCalled()
    })

    it('fetches and sets album art for songs missing it', async () => {
      favorites.value = [{ id: 5, title: 'Foo — Bar' }]
      api.getSpotifyId.mockResolvedValue({ albumArt: 'newart.jpg', spotifyTrackId: 'sp123' })

      await sync.backfillAlbumArt()
      expect(favorites.value[0].albumArt).toBe('newart.jpg')
      expect(favorites.value[0].spotifyTrackId).toBe('sp123')
      expect(api.updateSong).toHaveBeenCalledWith(5, expect.objectContaining({ albumArt: 'newart.jpg' }))
    })

    it('handles fetch failure gracefully', async () => {
      favorites.value = [{ title: 'A — B' }]
      api.getSpotifyId.mockResolvedValue(null)

      await sync.backfillAlbumArt() // should not throw
    })
  })
})
