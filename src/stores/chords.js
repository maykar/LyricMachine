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

  async function fetchChords(title, { keepDrawerOpen = false } = {}) {
    if (!title) return
    const parts = title.split(' — ')
    if (parts.length < 2) return

    const artist = parts[0].trim()
    const track = parts[1].trim()

    if (!keepDrawerOpen) {
      showPlayer.value = false
    }

    showChords.value = true
    chordsLoading.value = true
    chordsFound.value = false
    chordSections.value = []
    chordStructure.value = ''
    chordCapo.value = null
    chordTranspose.value = 0
    if (!keepDrawerOpen) spotifyTrackId.value = null

    const favStore = useFavoritesStore()
    const fav = favStore.favorites.find(f => f.title === title)

    if (fav) {
      chordTranspose.value = fav.transpose || 0
    }

    // Load saved chords from favorites
    if (fav && fav.customChords) {
      chordSections.value = fav.customChords
      chordStructure.value = fav.customStructure || ''
      spotifyTrackId.value = fav.spotifyTrackId || null
      chordCapo.value = fav.capo ?? null
      chordsFound.value = true
      chordsLoading.value = false
      showChords.value = true

      if (!fav.spotifyTrackId) {
        fetchSpotifyId(artist, track, fav)
      }
      return
    }

    // No saved chords — show "no chords found" but still fetch Spotify ID
    chordsLoading.value = false
    chordsFound.value = false
    fetchSpotifyId(artist, track, fav)
  }

  async function onChordsEdited({ sections, structure }) {
    chordSections.value = sections
    chordStructure.value = structure
    chordsFound.value = sections.length > 0

    const favStore = useFavoritesStore()
    if (favStore.currentTitle) {
      const fav = favStore.favorites.find(f => f.title === favStore.currentTitle)
      if (fav) {
        fav.customChords = sections
        fav.customStructure = structure
        if (fav.id) {
          api.updateSong(fav.id, { customChords: sections, customStructure: structure })
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

  return {
    showChords,
    chordsLoading,
    chordsFound,
    chordSections,
    chordStructure,
    chordCapo,
    chordTranspose,
    spotifyTrackId,
    showPlayer,
    hasCustomChords,
    fetchChords,
    onChordsEdited,
    onResetChords,
    onTransposeChords,
  }
})
