import { ref } from 'vue'

const DEFAULTS_KEY = 'lyricmachine_defaults'

export function useSettings() {
  const userDefaults = ref({ altColors: true, separators: false, merge: false })
  const showSettings = ref(false)
  const applyStatus = ref('')
  const resetChordStatus = ref('')

  function loadUserDefaults() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEFAULTS_KEY))
      if (saved) Object.assign(userDefaults.value, saved)
    } catch {}
  }

  function saveDefaults() {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(userDefaults.value))
  }

  function onDefaultsChanged(defs) {
    Object.assign(userDefaults.value, defs)
  }

  function applyDefaultsToAll(getFavorites, saveFavoritesArray) {
    const favs = getFavorites()
    if (!favs.length) {
      applyStatus.value = 'No favorites to update'
      setTimeout(() => applyStatus.value = '', 2000)
      return
    }
    for (const fav of favs) {
      fav.altColors = userDefaults.value.altColors
      fav.separators = userDefaults.value.separators
      fav.merge = userDefaults.value.merge
    }
    saveFavoritesArray(favs)
    applyStatus.value = `Updated ${favs.length} favorites`
    setTimeout(() => applyStatus.value = '', 2000)
  }

  function clearAllChords(getFavorites, saveFavoritesArray, fetchChordsFn, currentTitle) {
    const favs = getFavorites()
    if (!favs.length) {
      resetChordStatus.value = 'No favorites to clear'
      setTimeout(() => resetChordStatus.value = '', 2000)
      return
    }

    let cleared = 0
    for (const fav of favs) {
      if (fav.customChords) {
        delete fav.customChords
        delete fav.customStructure
        cleared++
      }
    }
    saveFavoritesArray(favs)

    resetChordStatus.value = `Cleared chords from ${cleared}/${favs.length} songs`
    setTimeout(() => resetChordStatus.value = '', 3000)

    // Update display for current song
    if (currentTitle.value) {
      fetchChordsFn(currentTitle.value, { keepDrawerOpen: true })
    }
  }

  return {
    userDefaults,
    showSettings,
    applyStatus,
    resetChordStatus,
    loadUserDefaults,
    saveDefaults,
    onDefaultsChanged,
    applyDefaultsToAll,
    clearAllChords,
  }
}
