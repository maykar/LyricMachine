import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for useChords (Pinia-backed).
 *
 * The store now imports favoritesStore internally instead of
 * receiving favorites/currentTitle/isSaved as constructor args.
 */

vi.mock('../../src/api.js', () => ({
  api: {
    updateSong: vi.fn(),
    getSpotifyId: vi.fn().mockResolvedValue({}),
  },
}))

const { api } = await import('../../src/api.js')
const { useChords } = await import('../../src/composables/useChords.js')
const { useFavorites } = await import('../../src/composables/useFavorites.js')

describe('useChords', () => {
  let chords, fav

  beforeEach(() => {
    setActivePinia(createPinia())
    fav = useFavorites()
    chords = useChords()
    // Clear state
    fav.favorites.value = []
    fav.currentTitle.value = ''
    fav.isSaved.value = false
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts with showChords false', () => {
      expect(chords.showChords.value).toBe(false)
    })

    it('starts with empty sections', () => {
      expect(chords.chordSections.value).toEqual([])
    })

    it('starts with no track ID', () => {
      expect(chords.spotifyTrackId.value).toBeNull()
    })
  })

  describe('hasCustomChords', () => {
    it('returns false when no current title', () => {
      expect(chords.hasCustomChords.value).toBe(false)
    })

    it('returns false when song has no custom chords', () => {
      fav.favorites.value = [{ title: 'Artist — Song' }]
      fav.currentTitle.value = 'Artist — Song'
      expect(chords.hasCustomChords.value).toBe(false)
    })

    it('returns true when song has custom chords', () => {
      fav.favorites.value = [{ title: 'Artist — Song', customChords: [{ section: 'VERSE', chords: 'Am C' }] }]
      fav.currentTitle.value = 'Artist — Song'
      expect(chords.hasCustomChords.value).toBe(true)
    })
  })

  describe('fetchChords', () => {
    it('does nothing for empty title', async () => {
      await chords.fetchChords('')
      expect(chords.showChords.value).toBe(false)
    })

    it('does nothing for title without separator', async () => {
      await chords.fetchChords('No Separator Here')
      expect(chords.showChords.value).toBe(false)
    })

    it('loads saved chords from favorite', async () => {
      fav.favorites.value = [{
        title: 'Foo — Bar',
        customChords: [{ section: 'VERSE', chords: 'Am C' }],
        customStructure: 'VERSE',
        spotifyTrackId: 'abc123',
        capo: 2,
      }]

      await chords.fetchChords('Foo — Bar')
      expect(chords.chordsFound.value).toBe(true)
      expect(chords.chordSections.value).toHaveLength(1)
      expect(chords.chordStructure.value).toBe('VERSE')
      expect(chords.spotifyTrackId.value).toBe('abc123')
      expect(chords.chordCapo.value).toBe(2)
    })

    it('sets chordsFound false when no saved chords', async () => {
      fav.favorites.value = [{ title: 'Foo — Bar' }]

      await chords.fetchChords('Foo — Bar')
      expect(chords.chordsFound.value).toBe(false)
      expect(chords.chordsLoading.value).toBe(false)
    })

    it('fetches Spotify ID when favorite has no track ID', async () => {
      fav.favorites.value = [{
        title: 'Foo — Bar',
        customChords: [{ section: 'VERSE', chords: 'Am C' }],
      }]

      await chords.fetchChords('Foo — Bar')
      expect(api.getSpotifyId).toHaveBeenCalledWith('Foo', 'Bar')
    })
  })

  describe('onChordsEdited', () => {
    it('updates local state', async () => {
      const sections = [{ section: 'CHORUS', chords: 'G D' }]
      await chords.onChordsEdited({ sections, structure: 'CHORUS' })

      expect(chords.chordSections.value).toEqual(sections)
      expect(chords.chordStructure.value).toBe('CHORUS')
      expect(chords.chordsFound.value).toBe(true)
    })

    it('saves to favorite and API when current song exists', async () => {
      fav.favorites.value = [{ id: 5, title: 'Foo — Bar' }]
      fav.currentTitle.value = 'Foo — Bar'
      const sections = [{ section: 'VERSE', chords: 'Am' }]

      await chords.onChordsEdited({ sections, structure: 'VERSE' })
      expect(fav.favorites.value[0].customChords).toEqual(sections)
      expect(api.updateSong).toHaveBeenCalledWith(5, { customChords: sections, customStructure: 'VERSE' })
    })

    it('sets chordsFound false when sections are empty', async () => {
      await chords.onChordsEdited({ sections: [], structure: '' })
      expect(chords.chordsFound.value).toBe(false)
    })
  })

  describe('onResetChords', () => {
    it('does nothing when no current title', async () => {
      fav.currentTitle.value = ''
      await chords.onResetChords()
      expect(api.updateSong).not.toHaveBeenCalled()
    })

    it('clears chords from favorite and API', async () => {
      fav.favorites.value = [{
        id: 7,
        title: 'Foo — Bar',
        customChords: [{ section: 'VERSE', chords: 'Am' }],
        customStructure: 'VERSE',
      }]
      fav.currentTitle.value = 'Foo — Bar'

      await chords.onResetChords()
      expect(fav.favorites.value[0].customChords).toBeUndefined()
      expect(fav.favorites.value[0].customStructure).toBeUndefined()
      expect(api.updateSong).toHaveBeenCalledWith(7, { customChords: null, customStructure: '', transpose: 0 })
    })
  })
})
