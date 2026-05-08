import * as db from './db.js'
import { normalize, pickAlbumArt, spotifyFetch, fetchLrcLibLyrics } from './utils.js'

// --- Route setup ---

export function setupSpotifyPlaylistRoutes(server, routes) {
  const { get, post, json, parseBody } = routes

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

// --- Lightweight order push (called after add/reorder) ---

/**
 * Replace the Spotify source playlist contents to match LyricMachine sort_order.
 * Lightweight — no imports, no track resolution, just reads current DB and pushes order.
 */
export async function pushOrderToSpotify() {
  const sourceSetting = db.getSetting('spotify_source_playlist')
  const playlistId = sourceSetting?.value || sourceSetting
  if (!playlistId) return

  const user = db.getSetting('spotify_user')
  if (!user) return

  const songs = db.getAllSongs()
  const uris = songs
    .filter(s => s.spotifyTrackId)
    .map(s => `spotify:track:${s.spotifyTrackId}`)

  if (uris.length > 0) {
    await replacePlaylistTracks(playlistId, uris)
    console.log(`Order push: synced ${uris.length} tracks to Spotify playlist`)
  }
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
  let pushed = 0

  // --- Pull: import new tracks from Spotify into LyricMachine ---
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
      const { plainLyrics, syncedLyrics } = lyricsResults[j]
      const title = `${track.artist} \u2014 ${track.name}`
      db.upsertSong({
        title,
        lyrics: plainLyrics,
        syncedLyrics: syncedLyrics || null,
        fontAdjust: 0,
        merge: defaults.merge || false,
        separators: defaults.separators || false,
        altColors: defaults.altColors !== false,
        spotifyTrackId: track.id || null,
        albumArt: track.albumArt || null,
      })
      imported++
      console.log(`Source sync: imported "${track.name}" ${plainLyrics ? '(with lyrics)' : '(no lyrics)'}${syncedLyrics ? ' [synced]' : ''}`)
    }
  }

  // --- Push: add local favorites to the Spotify playlist ---
  // Songs that already have a track ID but aren't in the playlist
  const withTrackId = songs.filter(s => s.spotifyTrackId && !playlistTrackIds.has(s.spotifyTrackId))

  // Songs without a track ID — search Spotify to resolve them
  const withoutTrackId = songs.filter(s => !s.spotifyTrackId)
  for (const song of withoutTrackId) {
    const sep = song.title.indexOf(' — ')
    if (sep < 0) continue
    const artist = song.title.slice(0, sep)
    const track = song.title.slice(sep + 3)
    try {
      const { getSpotifyToken } = await import('./spotify.js')
      const token = await getSpotifyToken()
      const headers = { Authorization: `Bearer ${token}` }

      // Try strict field-filtered search first
      const strictQ = encodeURIComponent(`artist:${artist} track:${track}`)
      let res = await fetch(`https://api.spotify.com/v1/search?q=${strictQ}&type=track&limit=5`, { headers })
      let data = await res.json()
      let firstTrack = data.tracks?.items?.[0]

      // Fallback: loose search (handles slight name differences)
      if (!firstTrack) {
        const looseQ = encodeURIComponent(`${artist} ${track}`)
        res = await fetch(`https://api.spotify.com/v1/search?q=${looseQ}&type=track&limit=5`, { headers })
        data = await res.json()
        firstTrack = data.tracks?.items?.[0]
      }

      if (firstTrack) {
        song.spotifyTrackId = firstTrack.id
        const albumArt = pickAlbumArt(firstTrack.album?.images)
        db.updateSong(song.id, { spotifyTrackId: firstTrack.id, albumArt })
        withTrackId.push(song)
        console.log(`Source sync: resolved Spotify ID for "${song.title}"`)
      }
    } catch (err) {
      console.warn(`Source sync: Spotify search failed for "${song.title}":`, err.message)
    }
  }

  const toAdd = withTrackId
  if (toAdd.length > 0) {
    const uris = toAdd.map(s => `spotify:track:${s.spotifyTrackId}`)
    await addTracksToPlaylist(playlistId, uris)
    pushed = toAdd.length
    // Clear notInPlaylist flag for pushed songs
    for (const song of toAdd) {
      if (song.notInPlaylist) {
        db.updateSong(song.id, { notInPlaylist: false })
      }
    }
    console.log(`Source sync: pushed ${pushed} local favorites to Spotify playlist`)
  }

  // Mark songs no longer in source playlist (skip songs without track IDs)
  for (const song of songs) {
    if (!song.spotifyTrackId) continue
    // Don't mark songs we just pushed
    if (toAdd.some(s => s.id === song.id)) continue
    if (!playlistTrackIds.has(song.spotifyTrackId) && !song.notInPlaylist) {
      db.updateSong(song.id, { notInPlaylist: true })
      markedRemoved++
    }
    // Clear flag if song is back in playlist
    if (playlistTrackIds.has(song.spotifyTrackId) && song.notInPlaylist) {
      db.updateSong(song.id, { notInPlaylist: false })
    }
  }

  // --- Order sync: push LyricMachine sort_order to Spotify playlist ---
  // Re-read songs after all mutations above (new imports, backfilled IDs)
  const finalSongs = db.getAllSongs()
  const orderedUris = finalSongs
    .filter(s => s.spotifyTrackId)
    .map(s => `spotify:track:${s.spotifyTrackId}`)

  if (orderedUris.length > 0) {
    await replacePlaylistTracks(playlistId, orderedUris)
    console.log(`Source sync: reordered Spotify playlist to match LyricMachine (${orderedUris.length} tracks)`)
  }

  return { imported, markedRemoved, pushed }
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

/**
 * Replace all tracks in a Spotify playlist (sets exact order).
 * PUT replaces the first batch, POST appends the rest.
 */
async function replacePlaylistTracks(playlistId, uris) {
  // PUT replaces entire playlist (max 100 URIs)
  const first = uris.slice(0, 100)
  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: first }),
  })

  // POST remaining batches
  for (let i = 100; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100)
    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    })
  }
}
