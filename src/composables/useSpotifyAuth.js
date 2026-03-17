import { ref, onMounted } from 'vue'

export function useSpotifyAuth() {
  const spotifyConnected = ref(false)
  const spotifyUser = ref('')

  async function checkSpotifyStatus() {
    try {
      const res = await fetch('/api/spotify/status')
      const data = await res.json()
      spotifyConnected.value = data.connected
      spotifyUser.value = data.displayName || ''
    } catch {
      spotifyConnected.value = false
      spotifyUser.value = ''
    }
  }

  function connectSpotify() {
    window.location.href = '/api/spotify/login'
  }

  async function disconnectSpotify() {
    try {
      await fetch('/api/spotify/disconnect', { method: 'POST' })
    } catch {}
    spotifyConnected.value = false
    spotifyUser.value = ''
  }

  onMounted(() => checkSpotifyStatus())

  return {
    spotifyConnected,
    spotifyUser,
    checkSpotifyStatus,
    connectSpotify,
    disconnectSpotify,
  }
}
