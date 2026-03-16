import { ref, computed } from 'vue'

export function useChords(favorites, currentTitle, isSaved) {
  const showChords = ref(false)
  const chordsLoading = ref(false)
  const chordsFound = ref(false)
  const chordSections = ref([])
  const chordStructure = ref('')
  const chordCapo = ref(null)
  const spotifyTrackId = ref(null)
  const showPlayer = ref(false)

  const hasCustomChords = computed(() => {
    if (!currentTitle.value) return false
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    return !!(fav && fav.customChords)
  })

  // Fetch Spotify track ID from the API and cache it in the DB
  async function fetchSpotifyId(artist, track, fav) {
    try {
      const res = await fetch(
        `/api/spotify-id?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.spotifyTrackId) {
        spotifyTrackId.value = data.spotifyTrackId
        if (fav) {
          fav.spotifyTrackId = data.spotifyTrackId
          if (data.albumArt) fav.albumArt = data.albumArt
          // Persist to DB
          if (fav.id) {
            const update = { spotifyTrackId: data.spotifyTrackId }
            if (data.albumArt) update.albumArt = data.albumArt
            fetch(`/api/songs/${fav.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(update),
            })
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

    // Close player on new song load (not on reset)
    if (!keepDrawerOpen) {
      showPlayer.value = false
    }

    showChords.value = true
    chordsLoading.value = true
    chordsFound.value = false
    chordSections.value = []
    chordStructure.value = ''
    chordCapo.value = null
    if (!keepDrawerOpen) spotifyTrackId.value = null

    const fav = favorites.value.find(f => f.title === title)

    // Load saved chords from favorites
    if (fav && fav.customChords) {
      chordSections.value = fav.customChords
      chordStructure.value = fav.customStructure || ''
      spotifyTrackId.value = fav.spotifyTrackId || null
      chordsFound.value = true
      chordsLoading.value = false
      showChords.value = true

      // Background-fetch Spotify ID if not cached yet
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

    if (currentTitle.value) {
      const fav = favorites.value.find(f => f.title === currentTitle.value)
      if (fav) {
        fav.customChords = sections
        fav.customStructure = structure
        if (fav.id) {
          fetch(`/api/songs/${fav.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customChords: sections, customStructure: structure }),
          })
        }
      }
    }
  }

  async function onResetChords() {
    if (!currentTitle.value) return
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      delete fav.customChords
      delete fav.customStructure
      if (fav.id) {
        fetch(`/api/songs/${fav.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customChords: null, customStructure: '' }),
        })
      }
    }
    fetchChords(currentTitle.value, { keepDrawerOpen: true })
  }

  return {
    showChords,
    chordsLoading,
    chordsFound,
    chordSections,
    chordStructure,
    chordCapo,
    spotifyTrackId,
    showPlayer,
    hasCustomChords,
    fetchChords,
    onChordsEdited,
    onResetChords,
  }
}
