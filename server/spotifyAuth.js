import crypto from 'crypto'
import * as db from './db.js'
import { encrypt, decrypt } from './crypto.js'

const SCOPES = 'playlist-modify-public playlist-modify-private playlist-read-private user-modify-playback-state user-read-playback-state streaming user-read-email user-read-private'

function getRedirectUri() {
  if (!process.env.SPOTIFY_REDIRECT_URI) {
    throw new Error('SPOTIFY_REDIRECT_URI not set in .env — required for Spotify OAuth')
  }
  return process.env.SPOTIFY_REDIRECT_URI
}

export function setupSpotifyAuthRoutes(server, { get, post, put, json, parseBody }) {

  // GET /api/spotify/login — redirect user to Spotify authorization
  get(server, '/api/spotify/login', (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    if (!clientId) return json(res, { error: 'SPOTIFY_CLIENT_ID not configured' }, 500)

    const state = crypto.randomBytes(16).toString('hex')
    db.setSetting('spotify_auth_state', { state, createdAt: Date.now() })

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: SCOPES,
      state,
      show_dialog: 'true',
    })

    res.writeHead(302, { Location: `https://accounts.spotify.com/authorize?${params}` })
    res.end()
  })

  // GET /api/spotify/callback — exchange code for tokens
  get(server, '/api/spotify/callback', async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      res.writeHead(302, { Location: '/?spotify_error=' + encodeURIComponent(error) })
      res.end()
      return
    }

    // Validate state with 5-minute expiry
    const saved = db.getSetting('spotify_auth_state')
    const STATE_MAX_AGE = 5 * 60 * 1000 // 5 minutes
    if (!saved || state !== saved.state || (Date.now() - saved.createdAt) > STATE_MAX_AGE) {
      res.writeHead(302, { Location: '/?spotify_error=state_mismatch' })
      res.end()
      return
    }

    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: getRedirectUri(),
        }),
      })

      const tokenData = await tokenRes.json()

      if (!tokenRes.ok) {
        console.error('Spotify token exchange failed:', tokenData)
        res.writeHead(302, { Location: '/?spotify_error=token_exchange_failed' })
        res.end()
        return
      }

      // Fetch user profile
      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const profile = await profileRes.json()

      // Store tokens + profile
      db.setSetting('spotify_tokens', encrypt({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
      }))
      db.setSetting('spotify_user', {
        id: profile.id,
        displayName: profile.display_name || profile.id,
      })

      console.log(`Spotify connected: ${profile.display_name || profile.id}`)
      res.writeHead(302, { Location: '/?spotify_connected=1' })
      res.end()
    } catch (err) {
      console.error('Spotify callback error:', err.message)
      res.writeHead(302, { Location: '/?spotify_error=callback_failed' })
      res.end()
    }
  })

  // GET /api/spotify/status — check connection status
  get(server, '/api/spotify/status', (req, res) => {
    const tokens = decrypt(db.getSetting('spotify_tokens'))
    const user = db.getSetting('spotify_user')
    if (tokens && user) {
      json(res, { connected: true, displayName: user.displayName, userId: user.id })
    } else {
      json(res, { connected: false })
    }
  })

  // GET /api/spotify/token — expose raw token for frontend Web Playback SDK
  get(server, '/api/spotify/token', async (req, res) => {
    try {
      const token = await getUserToken()
      if (!token) return json(res, { error: 'Not connected to Spotify' }, 401)
      json(res, { token })
    } catch (err) {
      console.error('Spotify token fetch exception:', err.message)
      json(res, { error: err.message }, 500)
    }
  })

  // POST /api/spotify/disconnect — clear tokens
  post(server, '/api/spotify/disconnect', (req, res) => {
    db.setSetting('spotify_tokens', null)
    db.setSetting('spotify_user', null)
    console.log('Spotify disconnected')
    json(res, { ok: true })
  })

  // PUT /api/spotify/play — transfer playback to SDK device, then play track
  put(server, '/api/spotify/play', async (req, res) => {
    try {
      const token = await getUserToken()
      if (!token) return json(res, { error: 'Not connected to Spotify' }, 401)
      
      const body = await parseBody(req)
      const { trackId, deviceId } = body || {}
      if (!trackId) return json(res, { error: 'trackId required' }, 400)

      // Step 1: Transfer playback to the SDK device (makes it "active")
      // This is required — without it the SDK receives track metadata but
      // the audio pipeline is never connected.
      if (deviceId) {
        const transferRes = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ device_ids: [deviceId], play: false })
        })
        if (!transferRes.ok) {
          const errorText = await transferRes.text()
          console.error('Spotify transfer error:', transferRes.status, errorText)
          // Don't bail — try to play anyway
        }
      }

      // Step 2: Play the specific track on the (now active) device
      const url = new URL('https://api.spotify.com/v1/me/player/play')
      if (deviceId) {
        url.searchParams.append('device_id', deviceId)
      }

      const playRes = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
      })

      if (!playRes.ok) {
        const errorText = await playRes.text()
        console.error('Spotify play error:', playRes.status, errorText)
        return json(res, { error: 'Failed to play track.', details: errorText }, playRes.status)
      }

      json(res, { ok: true })
    } catch (err) {
      console.error('Spotify play exception:', err.message)
      json(res, { error: err.message }, 500)
    }
  })
}

// --- Token helper (exported for other modules) ---

/**
 * Returns a valid Spotify user access token.
 * Auto-refreshes if expired. Returns null if not connected.
 */
let activeRefreshPromise = null

export async function getUserToken() {
  const tokens = decrypt(db.getSetting('spotify_tokens'))
  if (!tokens) return null

  // Still valid (with 60s buffer)
  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token
  }

  // Prevent concurrent refresh floods
  if (activeRefreshPromise) return activeRefreshPromise

  activeRefreshPromise = (async () => {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('Spotify token refresh failed:', data)
        // Clear invalid tokens
        db.setSetting('spotify_tokens', null)
        db.setSetting('spotify_user', null)
        return null
      }

      const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
      }
      db.setSetting('spotify_tokens', encrypt(updated))
      return updated.access_token
    } catch (err) {
      console.error('Spotify token refresh error:', err.message)
      return null
    } finally {
      activeRefreshPromise = null
    }
  })()

  return activeRefreshPromise
}
