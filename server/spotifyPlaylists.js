import * as db from './db.js'
import { normalize, pickAlbumArt, spotifyFetch, fetchLrcLibLyrics } from './utils.js'

// --- Route setup ---

export function setupSpotifyPlaylistRoutes(server, { get, post, json, parseBody }) {

  // GET /api/spotify/playlists — list user's playlists for the picker
  get(server, '/api/spotify/playlists', async (req, res) => {
    try {
      const playlists = []
      let url = 'https://api.spotify.com/v1/me/playlists?limit=50'

      while (url) {
        const resp = await spotifyFetch(url)
        if (!resp.ok) {
          json(res, { error: 'Failed to fetch playlists', status: resp.status }, resp.status)
          return
        }
        const data = await resp.json()
        for (const pl of (data.items || [])) {
          playlists.push({ id: pl.id, name: pl.name, trackCount: pl.tracks?.total || 0 })
        }
        url = data.next || null
      }

      json(res, { playlists })
    } catch (err) {
      console.error('Playlist list error:', err.message)
      json(res, { error: err.message }, 500)
    }
  })


  // POST /api/spotify/playlists/sync — full bi-directional sync
  post(server, '/api/spotify/playlists/sync', async (req, res) => {
    try {
      const result = await runFullSync()
      json(res, result)
    } catch (err) {
      console.error('Playlist sync error:', err.message)
      json(res, { error: err.message }, 500)
    }
  })

  // POST /api/spotify/playlists/add-to-source — add a track back to source playlist
  post(server, '/api/spotify/playlists/add-to-source', async (req, res) => {
    try {
      const body = await parseBody(req)
      const { trackId } = body

      if (!trackId) {
        json(res, { error: 'trackId required' }, 400)
        return
      }

      const sourceSetting = db.getSetting('spotify_source_playlist')
      const playlistId = sourceSetting?.value || sourceSetting
      if (!playlistId) {
        json(res, { error: 'No source playlist configured' }, 400)
        return
      }

      await addTracksToPlaylist(playlistId, [`spotify:track:${trackId}`])
      console.log(`Added track ${trackId} to source playlist`)
      json(res, { ok: true })
    } catch (err) {
      console.error('Add to source playlist error:', err.message)
      json(res, { error: err.message }, 500)
    }
  })
}

// --- Sync engine ---

let syncInFlight = false

async function runFullSync() {
  // Mutex: prevent concurrent syncs from duplicating work
  if (syncInFlight) {
    console.log('Sync already in progress, skipping')
    return { skipped: true }
  }
  syncInFlight = true

  try {
    const user = db.getSetting('spotify_user')
    if (!user) throw new Error('Spotify not connected')

    const sourcePlaylistId = db.getSetting('spotify_source_playlist')?.value || db.getSetting('spotify_source_playlist') || ''

    const results = { sourceImported: 0, sourceMarkedRemoved: 0 }

    // --- Source playlist sync ---
    if (sourcePlaylistId) {
      const syncResult = await syncSourcePlaylist(sourcePlaylistId)
      results.sourceImported = syncResult.imported
      results.sourceMarkedRemoved = syncResult.markedRemoved
    }

    console.log('Sync results:', results)
    return results
  } finally {
    syncInFlight = false
  }
}

// --- Source playlist sync ---

async function syncSourcePlaylist(playlistId) {
  // Lightweight fetch: only id/title/spotifyTrackId/notInPlaylist needed for diff
  const songs = db.getAllSongTitlesAndTrackIds()

  // Fetch all tracks from source playlist
  const playlistTracks = await getPlaylistTracks(playlistId)
  const playlistTrackIds = new Set(playlistTracks.filter(t => t.id).map(t => t.id))
  const existingNormalized = new Map(songs.map(s => [normalize(s.title), s]))

  let imported = 0
  let markedRemoved = 0

  // Collect new tracks to import
  const newTracks = playlistTracks.filter(track => {
    if (track.type !== 'track') return false
    const title = `${track.artist} \u2014 ${track.name}`
    return !existingNormalized.has(normalize(title))
  })

  // Fetch lyrics in parallel batches of 5
  const BATCH_SIZE = 5
  const defaults = db.getSetting('userDefaults') || {}
  for (let i = 0; i < newTracks.length; i += BATCH_SIZE) {
    const batch = newTracks.slice(i, i + BATCH_SIZE)
    const lyricsResults = await Promise.all(
      batch.map(track => fetchLrcLibLyrics(track.artist, track.name))
    )
    for (let j = 0; j < batch.length; j++) {
      const track = batch[j]
      const lyrics = lyricsResults[j]
      const title = `${track.artist} \u2014 ${track.name}`
      db.upsertSong({
        title,
        lyrics,
        fontAdjust: 0,
        merge: defaults.merge || false,
        separators: defaults.separators || false,
        altColors: defaults.altColors !== false,
        spotifyTrackId: track.id || null,
        albumArt: track.albumArt || null,
      })
      imported++
      console.log(`Source sync: imported "${track.name}" ${lyrics ? '(with lyrics)' : '(no lyrics)'}`)
    }
  }

  // Mark songs no longer in source playlist
  for (const song of songs) {
    if (!song.spotifyTrackId) continue
    if (!playlistTrackIds.has(song.spotifyTrackId) && !song.notInPlaylist) {
      db.updateSong(song.id, { notInPlaylist: true })
      markedRemoved++
    }
    // Clear flag if song is back in playlist
    if (playlistTrackIds.has(song.spotifyTrackId) && song.notInPlaylist) {
      db.updateSong(song.id, { notInPlaylist: false })
    }
  }

  return { imported, markedRemoved }
}

// --- Spotify API helpers ---

async function getPlaylistTracks(playlistId) {
  const tracks = []
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,type,artists(name),album(images))),next&limit=100`

  while (url) {
    const res = await spotifyFetch(url)
    if (!res.ok) break
    const data = await res.json()
    for (const item of (data.items || [])) {
      if (!item.track) continue
      const artist = item.track.artists?.map(a => a.name).join(', ') || 'Unknown'
      const albumArt = pickAlbumArt(item.track.album?.images)
      tracks.push({
        id: item.track.id,
        name: item.track.name,
        artist,
        albumArt,
        type: item.track.type || 'track',
      })
    }
    url = data.next || null
  }

  return tracks
}

async function addTracksToPlaylist(playlistId, uris) {
  // Spotify allows max 100 per request
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100)
    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    })
  }
}
