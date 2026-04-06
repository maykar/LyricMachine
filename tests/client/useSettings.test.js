import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for useSettings (Pinia-backed).
 *
 * applyDefaultsToAll() and clearAllChords() no longer take args —
 * they import favoritesStore and chordsStore internally.
 */

// Mock api.js
vi.mock('../../src/api.js', () => ({
  api: {
    getSetting: vi.fn(),
    setSettingRaw: vi.fn(),
    bulkUpdate: vi.fn(),
    clearChords: vi.fn(),
    updateSong: vi.fn(),
    getSpotifyId: vi.fn().mockResolvedValue({}),
  },
}))

const { api } = await import('../../src/api.js')
const { useSettings } = await import('../../src/composables/useSettings.js')
const { useFavorites } = await import('../../src/composables/useFavorites.js')

describe('useSettings', () => {
  let settings, fav

  beforeEach(() => {
    setActivePinia(createPinia())
    settings = useSettings()
    fav = useFavorites()
    fav.favorites.value = []
    vi.clearAllMocks()
  })

  describe('loadUserDefaults', () => {
    it('merges saved settings into defaults', async () => {
      api.getSetting.mockResolvedValue({ merge: true, separators: true })

      await settings.loadUserDefaults()
      expect(settings.userDefaults.value.merge).toBe(true)
      expect(settings.userDefaults.value.separators).toBe(true)
      expect(settings.userDefaults.value.altColors).toBe(true) // preserved from default
    })

    it('keeps defaults when server returns null', async () => {
      api.getSetting.mockResolvedValue(null)

      await settings.loadUserDefaults()
      expect(settings.userDefaults.value).toEqual({ altColors: true, separators: false, merge: false, mergeAggressive: false, collapseChorus: false })
    })
  })

  describe('saveDefaults', () => {
    it('calls api.setSettingRaw with current defaults', async () => {
      api.setSettingRaw.mockResolvedValue(null)
      settings.userDefaults.value = { altColors: false, separators: true, merge: true, mergeAggressive: true, collapseChorus: false }

      await settings.saveDefaults()
      expect(api.setSettingRaw).toHaveBeenCalledWith('defaults', { altColors: false, separators: true, merge: true, mergeAggressive: true, collapseChorus: false })
    })
  })

  describe('onDefaultsChanged', () => {
    it('updates userDefaults reactively', () => {
      settings.onDefaultsChanged({ merge: true })
      expect(settings.userDefaults.value.merge).toBe(true)
    })
  })

  describe('applyDefaultsToAll', () => {
    it('calls bulkUpdate for each setting and updates local favs', async () => {
      api.bulkUpdate.mockResolvedValue({})
      fav.favorites.value = [
        { id: 1, altColors: false, separators: false, merge: false, mergeAggressive: false, collapseChorus: false },
        { id: 2, altColors: false, separators: false, merge: false, mergeAggressive: false, collapseChorus: false },
      ]
      settings.userDefaults.value = { altColors: true, separators: true, merge: true, mergeAggressive: true, collapseChorus: true }

      await settings.applyDefaultsToAll()

      expect(api.bulkUpdate).toHaveBeenCalledTimes(5)
      expect(api.bulkUpdate).toHaveBeenCalledWith('altColors', true)
      expect(api.bulkUpdate).toHaveBeenCalledWith('separators', true)
      expect(api.bulkUpdate).toHaveBeenCalledWith('merge', true)
      expect(api.bulkUpdate).toHaveBeenCalledWith('mergeAggressive', true)
      expect(api.bulkUpdate).toHaveBeenCalledWith('collapseChorus', true)

      // Local favs updated
      expect(fav.favorites.value[0].altColors).toBe(true)
      expect(fav.favorites.value[1].merge).toBe(true)
    })

    it('shows no-favorites message when empty', async () => {
      vi.useFakeTimers()
      await settings.applyDefaultsToAll()
      expect(settings.applyStatus.value).toBe('No favorites to update')
      vi.useRealTimers()
    })
  })

  describe('clearAllChords', () => {
    it('calls api.clearChords and cleans local state', async () => {
      api.clearChords.mockResolvedValue({})
      fav.favorites.value = [
        { id: 1, customChords: [{ section: 'VERSE', chords: 'Am C' }] },
        { id: 2 },
      ]

      await settings.clearAllChords()

      expect(api.clearChords).toHaveBeenCalled()
      expect(fav.favorites.value[0].customChords).toBeUndefined()
    })
  })
})
