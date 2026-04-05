import { getUserToken, forceRefreshToken } from './spotifyAuth.js'
// Single source of truth — shared between server and client
export { normalize } from '../shared/normalize.js'
import { normalize } from '../shared/normalize.js'

// --- Spotify album art selector ---

/**
 * Pick the best album art URL from a Spotify images array.
 * Prefers the 300px medium image (index 1) over the full-size.
 */
export function pickAlbumArt(images) {
  if (!images || images.length === 0) return null
  return images.length > 1 ? images[1].url : (images[0]?.url || null)
}

// --- Spotify API fetch with 429 retry ---

/**
 * Authenticated Spotify fetch with automatic 429 retry.
 *
 * @param {string} url - Spotify API URL
 * @param {object} [opts={}] - fetch options (method, headers, body, etc.)
 * @param {object} [config={}] - config options
 * @param {string} [config.token] - pre-fetched token (skips getUserToken)
 * @param {number} [config.maxRetries=3] - max 429 retries
 */
export async function spotifyFetch(url, opts = {}, { token: preToken, maxRetries = 3 } = {}) {
  let token = preToken || await getUserToken()
  if (!token) throw new Error('Spotify not connected')

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    })

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10)
      console.warn(`Spotify 429 — retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }

    // 401: token invalidated externally mid-batch — force a refresh and retry once
    if (res.status === 401 && attempt === 0) {
      console.warn('Spotify 401 — forcing token refresh and retrying once')
      token = await forceRefreshToken()
      if (!token) throw new Error('Spotify token refresh failed — not connected')
      continue
    }

    return res
  }

  throw new Error(`Spotify rate limit: exhausted ${maxRetries} retries for ${url}`)
}

// --- lrclib.net lyrics search ---

/**
 * Fetch plain lyrics from lrclib.net for a given artist + track.
 * Returns the lyrics string, or '' if not found.
 */
export async function fetchLrcLibLyrics(artist, track) {
  try {
    const q = `${artist} ${track}`
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return ''

    const data = await res.json()
    const exact = data.find(r =>
      r.plainLyrics &&
      normalize(r.artistName) === normalize(artist) &&
      normalize(r.trackName) === normalize(track)
    )
    const fallback = data.find(r => r.plainLyrics)
    return (exact || fallback)?.plainLyrics || ''
  } catch {
    return ''
  }
}
