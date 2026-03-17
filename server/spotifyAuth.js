import crypto from 'crypto'
import * as db from './db.js'

const SCOPES = 'playlist-modify-public playlist-modify-private playlist-read-private'

function getRedirectUri() {
  return process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:5555/api/spotify/callback'
}

// --- Auth routes ---

export function setupSpotifyAuthRoutes(server, { get, post, json }) {

  // GET /api/spotify/login — redirect user to Spotify authorization
  get(server, '/api/spotify/login', (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    if (!clientId) return json(res, { error: 'SPOTIFY_CLIENT_ID not configured' }, 500)

    const state = crypto.randomBytes(16).toString('hex')
    db.setSetting('spotify_auth_state', state)

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

    // Validate state
    const savedState = db.getSetting('spotify_auth_state')
    if (state !== savedState) {
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
      db.setSetting('spotify_tokens', {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
      })
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
    const tokens = db.getSetting('spotify_tokens')
    const user = db.getSetting('spotify_user')
    if (tokens && user) {
      json(res, { connected: true, displayName: user.displayName, userId: user.id })
    } else {
      json(res, { connected: false })
    }
  })

  // POST /api/spotify/disconnect — clear tokens
  post(server, '/api/spotify/disconnect', (req, res) => {
    db.setSetting('spotify_tokens', null)
    db.setSetting('spotify_user', null)
    db.setSetting('spotify_label_playlists', null)
    console.log('Spotify disconnected')
    json(res, { ok: true })
  })
}

// --- Token helper (exported for other modules) ---

/**
 * Returns a valid Spotify user access token.
 * Auto-refreshes if expired. Returns null if not connected.
 */
export async function getUserToken() {
  const tokens = db.getSetting('spotify_tokens')
  if (!tokens) return null

  // Still valid (with 60s buffer)
  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token
  }

  // Refresh
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
    db.setSetting('spotify_tokens', updated)
    return updated.access_token
  } catch (err) {
    console.error('Spotify token refresh error:', err.message)
    return null
  }
}
