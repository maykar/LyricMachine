import { ref } from 'vue'
import { api } from '../api.js'

export function useSettings() {
  const userDefaults = ref({ altColors: true, separators: false, merge: false })
  const applyStatus = ref('')
  const resetChordStatus = ref('')

  async function loadUserDefaults() {
    const saved = await api.getSetting('defaults')
    if (saved && Object.keys(saved).length) Object.assign(userDefaults.value, saved)
  }

  async function saveDefaults() {
    await api.setSettingRaw('defaults', userDefaults.value)
  }

  function onDefaultsChanged(defs) {
    Object.assign(userDefaults.value, defs)
  }

  async function applyDefaultsToAll(favorites) {
    const favs = favorites.value
    if (!favs.length) {
      applyStatus.value = 'No favorites to update'
      setTimeout(() => applyStatus.value = '', 2000)
      return
    }

    try {
      await api.bulkUpdate('altColors', userDefaults.value.altColors)
      await api.bulkUpdate('separators', userDefaults.value.separators)
      await api.bulkUpdate('merge', userDefaults.value.merge)

      for (const fav of favs) {
        fav.altColors = userDefaults.value.altColors
        fav.separators = userDefaults.value.separators
        fav.merge = userDefaults.value.merge
      }

      applyStatus.value = `Updated ${favs.length} favorites`
    } catch {
      applyStatus.value = 'Failed to update'
    }
    setTimeout(() => applyStatus.value = '', 2000)
  }

  async function clearAllChords(favorites, fetchChordsFn, currentTitle) {
    const favs = favorites.value
    if (!favs.length) {
      resetChordStatus.value = 'No favorites to clear'
      setTimeout(() => resetChordStatus.value = '', 2000)
      return
    }

    try {
      await api.clearChords()

      let cleared = 0
      for (const fav of favs) {
        if (fav.customChords) {
          delete fav.customChords
          delete fav.customStructure
          cleared++
        }
      }

      resetChordStatus.value = `Cleared chords from ${cleared}/${favs.length} songs`
    } catch {
      resetChordStatus.value = 'Failed to clear'
    }
    setTimeout(() => resetChordStatus.value = '', 3000)

    if (currentTitle.value) {
      fetchChordsFn(currentTitle.value, { keepDrawerOpen: true })
    }
  }

  return {
    userDefaults,
    applyStatus,
    resetChordStatus,
    loadUserDefaults,
    saveDefaults,
    onDefaultsChanged,
    applyDefaultsToAll,
    clearAllChords,
  }
}
