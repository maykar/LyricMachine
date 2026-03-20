/**
 * Centralized API client for LyricMachine.
 *
 * Every server endpoint has a typed wrapper here.
 * On failure: logs to console.error AND fires a toast notification.
 * Returns parsed JSON on success, or null on failure.
 */
import { useToast } from './composables/useToast.js'

const { showToast } = useToast()

// --- Internal helpers ---

async function request(url, options = {}) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      console.error(`API ${options.method || 'GET'} ${url} failed (${res.status}):`, text)
      showToast(`Request failed: ${url.replace('/api/', '')}`)
      return null
    }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    return null // 204 No Content or non-JSON
  } catch (err) {
    console.error(`API ${options.method || 'GET'} ${url} error:`, err.message)
    showToast(`Network error: ${url.replace('/api/', '')}`)
    return null
  }
}

function get(url) {
  return request(url)
}

function post(url, body) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function put(url, body) {
  return request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function del(url) {
  return request(url, { method: 'DELETE' })
}

// --- Songs ---

export const api = {
  // Songs CRUD
  getSongs: () => get('/api/songs'),
  createSong: (data) => post('/api/songs', data),
  updateSong: (id, fields) => put(`/api/songs/${id}`, fields),
  deleteSong: (id) => del(`/api/songs/${id}`),
  reorderSongs: (ids) => put('/api/songs/reorder', { ids }),
  bulkUpdate: (field, value) => put('/api/songs/bulk-update', { field, value }),
  clearChords: () => put('/api/songs/clear-chords', {}),
  importSongs: (songs) => post('/api/import', songs),

  // Settings
  getSetting: (key) => get(`/api/settings/${key}`),
  setSetting: (key, value) => put(`/api/settings/${key}`, typeof value === 'object' ? value : { value }),
  /** Save settings with a raw body (for arrays like mosaic_genres) */
  setSettingRaw: (key, body) => put(`/api/settings/${key}`, body),
  getFilters: () => get('/api/settings/filters'),
  setFilters: (filters) => put('/api/settings/filters', filters),

  // Spotify
  getSpotifyStatus: () => get('/api/spotify/status'),
  disconnectSpotify: () => post('/api/spotify/disconnect', {}),
  getSpotifyPlaylists: () => get('/api/spotify/playlists'),
  syncSpotify: () => post('/api/spotify/playlists/sync', {}),
  addToSourcePlaylist: (trackId) => post('/api/spotify/playlists/add-to-source', { trackId }),

  // Playlist tracks (for client-side sync)
  getPlaylistTracks: () => get('/api/playlist-tracks'),

  // UG Import
  getImportChords: () => get('/api/import-chords'),

  // Popular art (dashboard mosaic)
  getPopularArt: () => get('/api/popular-art'),

  // Search (lrclib)
  searchLyrics: (artist, track) =>
    get(`/api/search?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`),
}
