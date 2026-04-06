import { storeToRefs } from 'pinia'
import { useChordsStore } from '../stores/chords.js'

/**
 * Thin wrapper around the Pinia chords store.
 * Preserves the original composable API so consumers don't need to change.
 *
 * NOTE: No longer takes (favorites, currentTitle, isSaved) as args —
 * the store imports favoritesStore internally.
 */
export function useChords() {
  const store = useChordsStore()
  const {
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
  } = storeToRefs(store)

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
    fetchChords: store.fetchChords,
    onChordsEdited: store.onChordsEdited,
    onResetChords: store.onResetChords,
    onTransposeChords: store.onTransposeChords,
    toggleChords: store.toggleChords,
  }
}
