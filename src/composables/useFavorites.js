import { ref, computed } from 'vue'
import { api } from '../api.js'

// --- Module-level singleton: shared reactive state across all consumers ---
const favorites = ref([])
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

/** Fetch all songs from the server and populate the reactive cache */
async function loadFavorites() {
  const songs = await api.getSongs()
  if (songs) favorites.value = songs
}

/** POST a new song or update existing by title */
async function apiCreateSong(song) {
  return api.createSong(song)
}

/** PUT partial update to a song by ID */
async function apiUpdateSong(id, fields) {
  return api.updateSong(id, fields)
}

/** DELETE a song by ID */
async function apiDeleteSong(id) {
  await api.deleteSong(id)
}

/**
 * Provides favorites management.
 *
 * SINGLETON: All state (favorites, currentTitle, isSaved, etc.) is shared
 * module-level — every consumer sees the same values.
 */
export function useFavorites() {

  /** Return the shared reactive array's raw value (for APIs that need a plain array) */
  function getFavorites() {
    return favorites.value
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

  async function toggleStar() {
    if (!currentTitle.value || !currentLyrics.value) return

    const idx = favorites.value.findIndex(f => f.title === currentTitle.value)

    if (idx >= 0) {
      // Unsave — delete from DB and local cache
      const song = favorites.value[idx]
      favorites.value.splice(idx, 1)
      if (song.id) apiDeleteSong(song.id)
    } else {
      // Save — create in DB and add to local cache
      const newSong = {
        title: currentTitle.value,
        lyrics: currentLyrics.value,
        fontAdjust: fontAdjust.value,
        merge: songMerge.value,
        separators: songSeparators.value,
        altColors: songAltColors.value,
        label: 'fresh',
        played: false,
        playCount: 0,
      }
      const created = await apiCreateSong(newSong)
      if (created) favorites.value.push(created)
    }

    refreshSavedState()
  }

  /**
   * Persist a single property change — update local cache optimistically, then fire API.
   *
   * INTENTIONAL: We do NOT rollback the local state on API failure.
   * This is a personal local-network tool where connectivity is reliable
   * and the UX cost of a stale-on-failure state (until next reload) is
   * much lower than the jank of reverting values visually. Failures are
   * still logged to console for debugging.
   */
  function updateFavProp(prop, value) {
    if (!isSaved.value) return
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      fav[prop] = value
      if (fav.id) apiUpdateSong(fav.id, { [prop]: value }).catch(err =>
        console.warn(`Failed to persist ${prop}:`, err.message)
      )
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
    favorites,
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songSeparators,
    songAltColors,
    isSaved,
    getFavorites,
    loadFavorites,
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
  }
}
