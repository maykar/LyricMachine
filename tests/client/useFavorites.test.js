import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock api.js to isolate useFavorites logic
vi.mock('../../src/api.js', () => ({
  api: {
    getSongs: vi.fn(),
    getSongsSummary: vi.fn(),
    createSong: vi.fn(),
    updateSong: vi.fn(),
    deleteSong: vi.fn(),
  },
}))

const { api } = await import('../../src/api.js')

// Must import after mock is set up
const { useFavorites } = await import('../../src/composables/useFavorites.js')

describe('useFavorites', () => {
  let fav

  beforeEach(() => {
    setActivePinia(createPinia())
    fav = useFavorites()
    // Clear state between tests
    fav.favorites.value = []
    fav.currentTitle.value = ''
    fav.currentLyrics.value = ''
    vi.clearAllMocks()
  })

  it('returns singleton state', () => {
    const a = useFavorites()
    const b = useFavorites()
    // Both wrappers should point to the same underlying state
    a.currentTitle.value = 'Test'
    expect(b.currentTitle.value).toBe('Test')
  })

  describe('loadFavorites', () => {
    it('populates favorites from api.getSongsSummary', async () => {
      const songs = [{ id: 1, title: 'Song A' }, { id: 2, title: 'Song B' }]
      api.getSongsSummary.mockResolvedValue(songs)

      await fav.loadFavorites()
      expect(fav.favorites.value).toEqual(songs)
    })

    it('keeps existing favorites if api returns null', async () => {
      fav.favorites.value = [{ id: 1, title: 'Existing' }]
      api.getSongsSummary.mockResolvedValue(null)

      await fav.loadFavorites()
      expect(fav.favorites.value).toHaveLength(1)
    })
  })

  describe('refreshSavedState', () => {
    it('sets isSaved to true when current title matches a favorite', () => {
      fav.favorites.value = [{ title: 'My Song' }]
      fav.currentTitle.value = 'My Song'
      fav.refreshSavedState()
      expect(fav.isSaved.value).toBe(true)
    })

    it('sets isSaved to false when no match', () => {
      fav.favorites.value = [{ title: 'Other Song' }]
      fav.currentTitle.value = 'My Song'
      fav.refreshSavedState()
      expect(fav.isSaved.value).toBe(false)
    })

    it('sets isSaved to false when currentTitle is empty', () => {
      fav.currentTitle.value = ''
      fav.refreshSavedState()
      expect(fav.isSaved.value).toBe(false)
    })
  })

  describe('refreshCurrentSong', () => {
    it('loads per-song settings from matching favorite', () => {
      fav.favorites.value = [{
        title: 'Song A', merge: true, separators: true, altColors: false,
        label: 'getting_there', played: true, playCount: 5,
      }]
      fav.currentTitle.value = 'Song A'
      fav.refreshCurrentSong()

      expect(fav.songMerge.value).toBe(true)
      expect(fav.songSeparators.value).toBe(true)
      expect(fav.songAltColors.value).toBe(false)
      expect(fav.currentLabel.value).toBe('getting_there')
      expect(fav.currentPlayed.value).toBe(true)
      expect(fav.currentPlayCount.value).toBe(5)
    })

    it('resets label/played when song not in favorites', () => {
      fav.favorites.value = []
      fav.currentTitle.value = 'Unknown Song'
      fav.refreshCurrentSong()

      expect(fav.currentLabel.value).toBeNull()
      expect(fav.currentPlayed.value).toBe(false)
      expect(fav.currentPlayCount.value).toBe(0)
    })
  })

  describe('toggleStar', () => {
    it('creates song when not saved', async () => {
      const created = { id: 10, title: 'New Song', lyrics: 'Lyrics here' }
      api.createSong.mockResolvedValue(created)

      fav.currentTitle.value = 'New Song'
      fav.currentLyrics.value = 'Lyrics here'
      await fav.toggleStar()

      expect(api.createSong).toHaveBeenCalled()
      expect(fav.favorites.value).toContainEqual(created)
    })

    it('deletes song when already saved', async () => {
      fav.favorites.value = [{ id: 5, title: 'Saved Song' }]
      fav.currentTitle.value = 'Saved Song'
      fav.currentLyrics.value = 'Some lyrics'
      api.deleteSong.mockResolvedValue(null)

      await fav.toggleStar()
      expect(api.deleteSong).toHaveBeenCalledWith(5)
      expect(fav.favorites.value).toHaveLength(0)
    })

    it('does nothing when no title or lyrics', async () => {
      fav.currentTitle.value = ''
      await fav.toggleStar()
      expect(api.createSong).not.toHaveBeenCalled()
      expect(api.deleteSong).not.toHaveBeenCalled()
    })
  })

  describe('togglePlayed', () => {
    it('toggles played and increments count', () => {
      fav.favorites.value = [{ id: 1, title: 'Song', played: false, playCount: 0 }]
      fav.currentTitle.value = 'Song'
      fav.refreshSavedState()

      fav.togglePlayed()
      expect(fav.currentPlayed.value).toBe(true)
      expect(fav.currentPlayCount.value).toBe(1)
    })

    it('toggles back without decrementing', () => {
      fav.favorites.value = [{ id: 1, title: 'Song', played: true, playCount: 3 }]
      fav.currentTitle.value = 'Song'
      fav.refreshCurrentSong()

      fav.togglePlayed()
      expect(fav.currentPlayed.value).toBe(false)
      expect(fav.currentPlayCount.value).toBe(3) // does not decrement
    })
  })
})
