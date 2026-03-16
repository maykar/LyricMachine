import { ref } from 'vue'

export function useSettings() {
  const userDefaults = ref({ altColors: true, separators: false, merge: false })
  const showSettings = ref(false)
  const applyStatus = ref('')
  const resetChordStatus = ref('')

  async function loadUserDefaults() {
    try {
      const res = await fetch('/api/settings/defaults')
      if (res.ok) {
        const saved = await res.json()
        if (saved && Object.keys(saved).length) Object.assign(userDefaults.value, saved)
      }
    } catch {}
  }

  async function saveDefaults() {
    try {
      await fetch('/api/settings/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDefaults.value),
      })
    } catch {}
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

    // Bulk update via API
    try {
      await fetch('/api/songs/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'altColors', value: userDefaults.value.altColors }),
      })
      await fetch('/api/songs/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'separators', value: userDefaults.value.separators }),
      })
      await fetch('/api/songs/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'merge', value: userDefaults.value.merge }),
      })

      // Update local cache
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
      await fetch('/api/songs/clear-chords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      })

      // Update local cache
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
