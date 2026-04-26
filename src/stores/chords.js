import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api.js'
import { useFavoritesStore } from './favorites.js'

/**
 * Chord management — fetching, editing, transpose, Spotify track ID.
 *
 * Previously a composable that took (favorites, currentTitle, isSaved) as
 * constructor args. Now a Pinia store that imports favoritesStore internally.
 */
export const useChordsStore = defineStore('chords', () => {
  const showChords = ref(false)
  const chordsLoading = ref(false)
  const chordsFound = ref(false)
  const chordSections = ref([])
  const chordStructure = ref('')
  const chordCapo = ref(null)
  const chordTonality = ref(null)
  const chordTuning = ref(null)
  const chordTranspose = ref(0)
  const spotifyTrackId = ref(null)
  const showPlayer = ref(false)

  const hasCustomChords = computed(() => {
    const favStore = useFavoritesStore()
    if (!favStore.currentTitle) return false
    const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
    return !!(fav && fav.customChords)
  })

  async function fetchSpotifyId(artist, track, fav) {
    try {
      const data = await api.getSpotifyId(artist, track)
      if (data?.spotifyTrackId) {
        spotifyTrackId.value = data.spotifyTrackId
        if (fav) {
          fav.spotifyTrackId = data.spotifyTrackId
          if (data.albumArt) fav.albumArt = data.albumArt
          if (fav.id) {
            const update = { spotifyTrackId: data.spotifyTrackId }
            if (data.albumArt) update.albumArt = data.albumArt
            api.updateSong(fav.id, update)
          }
        }
      }
    } catch {}
  }

  async function autoFetchChords(artist, track, fav) {
    try {
      const searchResults = await api.ugSearch(`${artist} ${track}`)
      if (searchResults && searchResults.length > 0) {
        for (const match of searchResults) {
          const chordData = await api.ugGetChords(match.id)
          if (chordData?.parsed && chordData.parsed.sections.length > 0) {
            chordSections.value = chordData.parsed.sections
            chordStructure.value = chordData.parsed.structure || ''
            chordCapo.value = chordData.parsed.capo || null
            chordTonality.value = chordData.parsed.tonalityName || null
            chordTuning.value = chordData.parsed.tuning || null
            chordsFound.value = true
            
            if (fav) {
              fav.customChords = chordSections.value
              fav.customStructure = chordStructure.value
              fav.capo = chordCapo.value
              fav.tonalityName = chordTonality.value
              fav.tuning = chordTuning.value
              showChords.value = true // Automatically show the freshly fetched chords
              fav.showChords = true // Persist the visible state
              if (fav.id) {
                api.updateSong(fav.id, { 
                  customChords: chordSections.value, 
                  customStructure: chordStructure.value,
                  capo: chordCapo.value,
                  tonalityName: chordTonality.value,
                  tuning: chordTuning.value,
                  showChords: true
                })
              }
            }
            break // We found a successfully parsed chord chart, stop iterating
          }
        }
      }
    } catch (err) {
      console.warn('Auto fetch chords failed:', err)
    } finally {
      if (!chordsFound.value) {
        chordsLoading.value = false
      }
    }
  }

  async function fetchChords(title, { keepDrawerOpen = false } = {}) {
    if (!title) return
    const parts = title.split(' — ')
    if (parts.length < 2) return

    const artist = parts[0].trim()
    const track = parts[1].trim()

    if (!keepDrawerOpen) {
      showPlayer.value = false
    }

    // showChords state is determined after loading fav data
    chordsLoading.value = true
    chordsFound.value = false
    chordSections.value = []
    chordStructure.value = ''
    chordCapo.value = null
    chordTonality.value = null
    chordTuning.value = null
    chordTranspose.value = 0
    if (!keepDrawerOpen) spotifyTrackId.value = null

    const favStore = useFavoritesStore()
    const fav = favStore.favorites.find(f => f.title === title)

    if (fav) {
      chordTranspose.value = fav.transpose || 0
    }

    // Load saved chords from favorites
    const hasValidChords = fav && Array.isArray(fav.customChords) ? fav.customChords.length > 0 : !!fav?.customChords
    if (hasValidChords) {
      chordSections.value = fav.customChords
      chordStructure.value = fav.customStructure || ''
      spotifyTrackId.value = fav.spotifyTrackId || null
      chordCapo.value = fav.capo ?? null
      chordTonality.value = fav.tonalityName || null
      chordTuning.value = fav.tuning || null
      chordsFound.value = true
      chordsLoading.value = false
      if (fav.showChords !== undefined) {
        showChords.value = fav.showChords
      } else {
        showChords.value = true
      }

      if (!fav.spotifyTrackId) {
        fetchSpotifyId(artist, track, fav)
      }
      return
    }

    // No saved chords — trigger auto-fetch and Spotify ID backfill
    chordsLoading.value = true
    chordsFound.value = false
    if (fav && fav.showChords !== undefined) {
      showChords.value = fav.showChords
    } else {
      showChords.value = false
    }
    fetchSpotifyId(artist, track, fav)
    autoFetchChords(artist, track, fav).then(() => {
      chordsLoading.value = false
    })
  }

  async function onChordsEdited({ sections, structure, capo, tonalityName, tuning }) {
    chordSections.value = sections
    chordStructure.value = structure
    if (capo !== undefined) chordCapo.value = capo
    if (tonalityName !== undefined) chordTonality.value = tonalityName
    if (tuning !== undefined) chordTuning.value = tuning
    chordsFound.value = sections.length > 0

    const favStore = useFavoritesStore()
    if (favStore.currentTitle) {
      const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
      if (fav) {
        fav.customChords = sections
        fav.customStructure = structure
        if (capo !== undefined) fav.capo = capo
        if (tonalityName !== undefined) fav.tonalityName = tonalityName
        if (tuning !== undefined) fav.tuning = tuning
        if (fav.id) {
          api.updateSong(fav.id, { 
            customChords: sections, 
            customStructure: structure,
            ...(capo !== undefined && { capo }),
            ...(tonalityName !== undefined && { tonalityName }),
            ...(tuning !== undefined && { tuning })
          })
        }
      }
    }
  }

  async function onResetChords() {
    const favStore = useFavoritesStore()
    if (!favStore.currentTitle) return
    const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
    if (fav) {
      delete fav.customChords
      delete fav.customStructure
      fav.transpose = 0
      if (fav.id) {
        api.updateSong(fav.id, { customChords: null, customStructure: '', transpose: 0 })
      }
    }
    fetchChords(favStore.currentTitle, { keepDrawerOpen: true })
  }

  async function onTransposeChords(semitones) {
    const favStore = useFavoritesStore()
    if (!favStore.currentTitle) return
    const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
    if (fav) {
      const newTranspose = (fav.transpose || 0) + semitones
      fav.transpose = newTranspose
      chordTranspose.value = newTranspose
      if (fav.id) {
        api.updateSong(fav.id, { transpose: newTranspose })
      }
    }
  }

  async function toggleChords() {
    showChords.value = !showChords.value
    const favStore = useFavoritesStore()
    if (favStore.currentTitle) {
      const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
      if (fav && fav.id) {
        fav.showChords = showChords.value
        api.updateSong(fav.id, { showChords: showChords.value })
      }
    }
  }

  return {
    showChords,
    chordsLoading,
    chordsFound,
    chordSections,
    chordStructure,
    chordCapo,
    chordTonality,
    chordTuning,
    chordTranspose,
    spotifyTrackId,
    showPlayer,
    hasCustomChords,
    fetchChords,
    onChordsEdited,
    onResetChords,
    onTransposeChords,
    toggleChords
  }
})
