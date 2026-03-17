import { ref } from 'vue'
import { api } from '../api.js'

export function useSpotifyAuth() {
  const spotifyConnected = ref(false)
  const spotifyUser = ref('')

  async function checkSpotifyStatus() {
    const data = await api.getSpotifyStatus()
    if (data) {
      spotifyConnected.value = data.connected
      spotifyUser.value = data.displayName || ''
    } else {
      spotifyConnected.value = false
      spotifyUser.value = ''
    }
  }

  function connectSpotify() {
    window.location.href = '/api/spotify/login'
  }

  async function disconnectSpotify() {
    await api.disconnectSpotify()
    spotifyConnected.value = false
    spotifyUser.value = ''
  }

  return {
    spotifyConnected,
    spotifyUser,
    checkSpotifyStatus,
    connectSpotify,
    disconnectSpotify,
  }
}
