import { ref, computed } from 'vue'

const STORAGE_KEY = 'lyricmachine_favorites'

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

  function getFavorites() {
    try {
      const favs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      /* Migrate: ensure every fav has a label (default 'fresh') */
      let migrated = false
      for (const f of favs) {
        if (!f.label) { f.label = 'fresh'; migrated = true }
        /* Migrate boolean played → separate played + playCount */
        if (typeof f.played === 'number' && f.played > 0 && f.playCount === undefined) {
          f.playCount = f.played
          f.played = true
          migrated = true
        } else if (typeof f.played === 'number' && f.playCount === undefined) {
          f.playCount = 0
          f.played = false
          migrated = true
        }
        if (f.playCount === undefined) {
          f.playCount = f.played ? 1 : 0
          migrated = true
        }
      }
      if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
      return favs
    } catch {
      return []
    }
  }

  function saveFavoritesArray(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
  }

  function refreshSavedState() {
    if (!currentTitle.value) {
      isSaved.value = false
      return
    }
    const favs = getFavorites()
    isSaved.value = favs.some(f => f.title === currentTitle.value)
  }

  function refreshCurrentSong() {
    refreshSavedState()
    if (!currentTitle.value) return
    const favs = getFavorites()
    const fav = favs.find(f => f.title === currentTitle.value)
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

    const favs = getFavorites()
    const idx = favs.findIndex(f => f.title === currentTitle.value)

    if (idx >= 0) {
      favs.splice(idx, 1)
    } else {
      favs.push({
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

    saveFavoritesArray(favs)
    refreshSavedState()
  }

  // Persist a single property change to favorites
  function updateFavProp(prop, value) {
    if (!isSaved.value) return
    const favs = getFavorites()
    const fav = favs.find(f => f.title === currentTitle.value)
    if (fav) {
      fav[prop] = value
      saveFavoritesArray(favs)
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
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songSeparators,
    songAltColors,
    isSaved,
    getFavorites,
    saveFavoritesArray,
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
