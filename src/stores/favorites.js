import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api.js'
import { useToastStore } from './toast.js'

// --- Module-level singleton: shared reactive state across all consumers ---

/**
 * Core app state — favorites list, current song, display settings.
 *
 * Migrated from module-level refs to Pinia for devtools visibility,
 * action tracking, and proper singleton guarantees.
 */
export const useFavoritesStore = defineStore('favorites', () => {
  const favorites = ref([])
  const currentTitle = ref('')
  const currentLyrics = ref('')
  const fontAdjust = ref(0)
  const songMerge = ref(false)
  const songMergeAggressive = ref(false)
  const songCollapseChorus = ref(false)
  const songSeparators = ref(false)
  const songAltColors = ref(true)
  const isSaved = ref(false)
  const currentLabel = ref(null)
  const currentPlayed = ref(false)
  const currentPlayCount = ref(0)

  // --- Library filters & sorting ---
  const hidePlayed = ref(false)
  const filterNoChords = ref(false)
  const filterFresh = ref(false)
  const filterGettingThere = ref(false)
  const filterInSetlist = ref(false)
  const filterIgnored = ref(false)
  const filterNotInPlaylist = ref(false)
  const filterCustomLabels = ref([])
  const sortBy = ref('none')
  const sortDir = ref('asc')

  const displayedFavorites = computed(() => {
    let list = favorites.value
    if (hidePlayed.value) list = list.filter(f => !f.played)
    if (filterNoChords.value) list = list.filter(f => !f.hasChords)
    if (filterNotInPlaylist.value) list = list.filter(f => !!f.notInPlaylist)
    const anyLabel = filterFresh.value || filterGettingThere.value || filterInSetlist.value || filterIgnored.value || filterCustomLabels.value.length > 0
    if (anyLabel) {
      list = list.filter(f => {
        const lbl = f.label || 'fresh'
        if (filterFresh.value && lbl === 'fresh') return true
        if (filterGettingThere.value && lbl === 'getting-there') return true
        if (filterInSetlist.value && lbl === 'in-setlist') return true
        if (filterIgnored.value && lbl === 'ignored') return true
        if (filterCustomLabels.value.length > 0) {
          const cLabels = f.customLabels || []
          if (filterCustomLabels.value.some(l => cLabels.includes(l))) return true
        }
        return false
      })
    } else {
      list = list.filter(f => f.label !== 'ignored')
    }
    if (sortBy.value !== 'none') {
      const labelOrder = { 'fresh': 0, 'getting-there': 1, 'in-setlist': 2, 'ignored': 3 }
      list = [...list].sort((a, b) => {
        let cmp = 0
        if (sortBy.value === 'alpha') {
          cmp = (a.title || '').localeCompare(b.title || '')
        } else if (sortBy.value === 'label') {
          cmp = (labelOrder[a.label] || 0) - (labelOrder[b.label] || 0)
        } else if (sortBy.value === 'playCount') {
          cmp = (a.playCount || 0) - (b.playCount || 0)
        }
        return sortDir.value === 'asc' ? cmp : -cmp
      })
    }
    return list
  })

  /** Fetch all songs from the server and populate the reactive cache */
  async function loadFavorites() {
    const songs = await api.getSongsSummary()
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
      songMergeAggressive.value = fav.mergeAggressive || false
      songCollapseChorus.value = fav.collapseChorus || false
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
        mergeAggressive: songMergeAggressive.value,
        collapseChorus: songCollapseChorus.value,
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
   * On failure: show an error toast and re-fetch all songs from the server to re-sync.
   */
  function updateFavProp(prop, value) {
    if (!isSaved.value) return
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      const oldValue = fav[prop]
      fav[prop] = value
      if (fav.id) apiUpdateSong(fav.id, { [prop]: value }).catch(err => {
        const toast = useToastStore()
        console.warn(`Failed to persist ${prop}:`, err.message)
        toast.showToast(`Failed to save ${prop}`, { type: 'error' })
        // Rollback local state and re-sync from server
        fav[prop] = oldValue
        loadFavorites()
      })
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

  function onMergeAggressiveChanged(val) {
    songMergeAggressive.value = val
    updateFavProp('mergeAggressive', val)
  }

  function onCollapseChorusChanged(val) {
    songCollapseChorus.value = val
    updateFavProp('collapseChorus', val)
  }

  function onSeparatorsChanged(val) {
    songSeparators.value = val
    updateFavProp('separators', val)
  }

  function onAltColorsChanged(val) {
    songAltColors.value = val
    updateFavProp('altColors', val)
  }

  function setLabel(label) {
    currentLabel.value = label
    updateFavProp('label', label)
  }

  function togglePlayed() {
    const newState = !currentPlayed.value
    currentPlayed.value = newState
    updateFavProp('played', newState)
    if (newState) {
      currentPlayCount.value = (currentPlayCount.value || 0) + 1
      updateFavProp('playCount', currentPlayCount.value)
    }
  }

  return {
    favorites,
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songMergeAggressive,
    songCollapseChorus,
    songSeparators,
    songAltColors,
    isSaved,
    currentLabel,
    currentPlayed,
    currentPlayCount,
    hidePlayed,
    filterNoChords,
    filterFresh,
    filterGettingThere,
    filterInSetlist,
    filterIgnored,
    filterNotInPlaylist,
    filterCustomLabels,
    sortBy,
    sortDir,
    displayedFavorites,
    getFavorites,
    loadFavorites,
    refreshSavedState,
    refreshCurrentSong,
    toggleStar,
    onAdjustChanged,
    onMergeChanged,
    onMergeAggressiveChanged,
    onCollapseChorusChanged,
    onSeparatorsChanged,
    onAltColorsChanged,
    setLabel,
    togglePlayed,
  }
})
