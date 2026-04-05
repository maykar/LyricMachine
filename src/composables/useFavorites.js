import { storeToRefs } from 'pinia'
import { useFavoritesStore } from '../stores/favorites.js'

/**
 * Thin wrapper around the Pinia favorites store.
 * Preserves the original composable API so consumers don't need to change.
 */
export function useFavorites() {
  const store = useFavoritesStore()
  const {
    favorites,
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songSeparators,
    songAltColors,
    isSaved,
    currentLabel,
    currentPlayed,
    currentPlayCount,
  } = storeToRefs(store)

  return {
    favorites,
    currentTitle,
    currentLyrics,
    fontAdjust,
    songMerge,
    songSeparators,
    songAltColors,
    isSaved,
    currentLabel,
    currentPlayed,
    currentPlayCount,
    getFavorites: store.getFavorites,
    loadFavorites: store.loadFavorites,
    refreshSavedState: store.refreshSavedState,
    refreshCurrentSong: store.refreshCurrentSong,
    toggleStar: store.toggleStar,
    onAdjustChanged: store.onAdjustChanged,
    onMergeChanged: store.onMergeChanged,
    onSeparatorsChanged: store.onSeparatorsChanged,
    onAltColorsChanged: store.onAltColorsChanged,
    setLabel: store.setLabel,
    togglePlayed: store.togglePlayed,
  }
}
