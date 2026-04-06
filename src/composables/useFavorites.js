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
  } = storeToRefs(store)

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
    getFavorites: store.getFavorites,
    loadFavorites: store.loadFavorites,
    refreshSavedState: store.refreshSavedState,
    refreshCurrentSong: store.refreshCurrentSong,
    toggleStar: store.toggleStar,
    onAdjustChanged: store.onAdjustChanged,
    onMergeChanged: store.onMergeChanged,
    onMergeAggressiveChanged: store.onMergeAggressiveChanged,
    onCollapseChorusChanged: store.onCollapseChorusChanged,
    onSeparatorsChanged: store.onSeparatorsChanged,
    onAltColorsChanged: store.onAltColorsChanged,
    setLabel: store.setLabel,
    togglePlayed: store.togglePlayed,
  }
}
