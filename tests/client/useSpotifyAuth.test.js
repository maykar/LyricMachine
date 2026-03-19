import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for useSpotifyAuth composable.
 */

vi.mock('../../src/api.js', () => ({
  api: {
    getSpotifyStatus: vi.fn(),
    disconnectSpotify: vi.fn(),
  },
}))

const { api } = await import('../../src/api.js')
const { useSpotifyAuth } = await import('../../src/composables/useSpotifyAuth.js')

describe('useSpotifyAuth', () => {
  let auth

  beforeEach(() => {
    auth = useSpotifyAuth()
    vi.clearAllMocks()
  })

  describe('checkSpotifyStatus', () => {
    it('sets connected and user when API returns data', async () => {
      api.getSpotifyStatus.mockResolvedValue({ connected: true, displayName: 'DJ Slosh' })

      await auth.checkSpotifyStatus()
      expect(auth.spotifyConnected.value).toBe(true)
      expect(auth.spotifyUser.value).toBe('DJ Slosh')
    })

    it('sets connected false when API returns null', async () => {
      api.getSpotifyStatus.mockResolvedValue(null)

      await auth.checkSpotifyStatus()
      expect(auth.spotifyConnected.value).toBe(false)
      expect(auth.spotifyUser.value).toBe('')
    })

    it('handles missing displayName', async () => {
      api.getSpotifyStatus.mockResolvedValue({ connected: true })

      await auth.checkSpotifyStatus()
      expect(auth.spotifyConnected.value).toBe(true)
      expect(auth.spotifyUser.value).toBe('')
    })
  })

  describe('disconnectSpotify', () => {
    it('calls API and resets state', async () => {
      auth.spotifyConnected.value = true
      auth.spotifyUser.value = 'DJ Slosh'
      api.disconnectSpotify.mockResolvedValue(null)

      await auth.disconnectSpotify()
      expect(api.disconnectSpotify).toHaveBeenCalled()
      expect(auth.spotifyConnected.value).toBe(false)
      expect(auth.spotifyUser.value).toBe('')
    })
  })
})
