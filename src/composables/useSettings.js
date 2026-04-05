import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../stores/settings.js'

/**
 * Thin wrapper around the Pinia settings store.
 * Preserves the original composable API so consumers don't need to change.
 *
 * NOTE: applyDefaultsToAll() and clearAllChords() no longer take args —
 * they import favoritesStore internally. Callers that previously passed
 * (favorites, ...) should remove those args.
 */
export function useSettings() {
  const store = useSettingsStore()
  const { userDefaults, applyStatus, resetChordStatus } = storeToRefs(store)
  return {
    userDefaults,
    applyStatus,
    resetChordStatus,
    loadUserDefaults: store.loadUserDefaults,
    saveDefaults: store.saveDefaults,
    onDefaultsChanged: store.onDefaultsChanged,
    applyDefaultsToAll: store.applyDefaultsToAll,
    clearAllChords: store.clearAllChords,
  }
}
