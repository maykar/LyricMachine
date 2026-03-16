import { ref, computed } from 'vue'

const STORAGE_KEY = 'lyricmachine_favorites'

// --- Module-level singleton: one reactive array shared by all consumers ---
const favorites = ref([])

function loadFromStorage() {
  try {
    favorites.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    favorites.value = []
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.value))
}

// Initial load
loadFromStorage()

export function useFavorites() {
  const currentTitle = ref('')
  const currentLyrics = ref('')
  const fontAdjust = ref(0)
  const songMerge = ref(false)
  const songSeparators = ref(false)
  const songAltColors = ref(true)
  const isSaved = ref(false)
  const currentLabel = ref(null)
  const currentPlayed = ref(false)
  const currentPlayCount = ref(0)

  /** Return the shared reactive array's raw value (for APIs that need a plain array) */
  function getFavorites() {
    return favorites.value
  }

  /** Replace the full array and persist */
  function saveFavoritesArray(favs) {
    favorites.value = favs
    saveToStorage()
  }

  /** Just persist current state (for in-place mutations) */
  function saveFavorites() {
    saveToStorage()
  }

  /** Reload from localStorage (e.g. after external changes) */
  function reload() {
    loadFromStorage()
  }

  function refreshSavedState() {
    if (!currentTitle.value) {
      isSaved.value = false
      return
    }
    isSaved.value = favorites.value.some(f => f.title === currentTitle.value)
  }

  function refreshCurrentSong() {
    refreshSavedState()
    if (!currentTitle.value) return
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      songMerge.value = fav.merge || false
      songSeparators.value = fav.separators || false
      songAltColors.value = fav.altColors !== false
      currentLabel.value = fav.label || 'fresh'
      currentPlayed.value = !!fav.played
      currentPlayCount.value = fav.playCount || 0
    } else {
      currentLabel.value = null
      currentPlayed.value = false
      currentPlayCount.value = 0
    }
  }

  function toggleStar() {
    if (!currentTitle.value || !currentLyrics.value) return

    const idx = favorites.value.findIndex(f => f.title === currentTitle.value)

    if (idx >= 0) {
      favorites.value.splice(idx, 1)
    } else {
      favorites.value.push({
        title: currentTitle.value,
        lyrics: currentLyrics.value,
        fontAdjust: fontAdjust.value,
        merge: songMerge.value,
        separators: songSeparators.value,
        altColors: songAltColors.value,
        label: 'fresh',
        played: false,
        playCount: 0,
      })
    }

    saveToStorage()
    refreshSavedState()
  }

  // Persist a single property change to favorites
  function updateFavProp(prop, value) {
    if (!isSaved.value) return
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      fav[prop] = value
      saveToStorage()
    }
  }

  function onAdjustChanged(adjust) {
    fontAdjust.value = adjust
    updateFavProp('fontAdjust', adjust)
  }

  function onMergeChanged(merge) {
    songMerge.value = merge
    updateFavProp('merge', merge)
  }

  function onSeparatorsChanged(val) {
    songSeparators.value = val
    updateFavProp('separators', val)
  }

  function onAltColorsChanged(val) {
    songAltColors.value = val
    updateFavProp('altColors', val)
  }

  return {
    STORAGE_KEY,
    favorites,
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songSeparators,
    songAltColors,
    isSaved,
    getFavorites,
    saveFavoritesArray,
    saveFavorites,
    reload,
    refreshSavedState,
    refreshCurrentSong,
    toggleStar,
    currentLabel,
    onAdjustChanged,
    onMergeChanged,
    onSeparatorsChanged,
    onAltColorsChanged,
    setLabel(label) {
      currentLabel.value = label
      updateFavProp('label', label)
    },
    currentPlayed,
    currentPlayCount,
    togglePlayed() {
      const newState = !currentPlayed.value
      currentPlayed.value = newState
      updateFavProp('played', newState)
      if (newState) {
        currentPlayCount.value = (currentPlayCount.value || 0) + 1
        updateFavProp('playCount', currentPlayCount.value)
      }
    },
    setPlayedCount(count) {
      currentPlayCount.value = count
      updateFavProp('playCount', count)
    },
  }
}
