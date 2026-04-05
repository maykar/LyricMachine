import { storeToRefs } from 'pinia'
import { useSpotifyAuthStore } from '../stores/spotifyAuth.js'

/**
 * Thin wrapper around the Pinia spotifyAuth store.
 * Preserves the original composable API so consumers don't need to change.
 */
export function useSpotifyAuth() {
  const store = useSpotifyAuthStore()
  const { spotifyConnected, spotifyUser } = storeToRefs(store)
  return {
    spotifyConnected,
    spotifyUser,
    checkSpotifyStatus: store.checkSpotifyStatus,
    connectSpotify: store.connectSpotify,
    disconnectSpotify: store.disconnectSpotify,
  }
}
