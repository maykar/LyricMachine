import * as db from './db.js'
import { normalize, pickAlbumArt, spotifyFetch, fetchLrcLibLyrics } from './utils.js'

// --- Route setup ---

export function setupSpotifyPlaylistRoutes(server, { get, post, json }) {

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

  // GET /api/spotify/playlists/label — get stored label→playlist mappings
  get(server, '/api/spotify/playlists/label', (req, res) => {
    const mappings = db.getSetting('spotify_label_playlists') || {}
    json(res, mappings)
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
      const { parseBody } = await import('./api.js')
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

    const bandName = db.getSetting('band_name')?.value || db.getSetting('band_name') || ''
    const labelSyncEnabled = db.getSetting('spotify_label_sync')
    const sourcePlaylistId = db.getSetting('spotify_source_playlist')?.value || db.getSetting('spotify_source_playlist') || ''

    const results = { sourceImported: 0, sourceMarkedRemoved: 0, labelsPushed: 0, labelsImported: 0 }

    // --- 1. Source playlist sync ---
    if (sourcePlaylistId) {
      const syncResult = await syncSourcePlaylist(sourcePlaylistId)
      results.sourceImported = syncResult.imported
      results.sourceMarkedRemoved = syncResult.markedRemoved
    }

    // --- 2. Label playlist sync ---
    if (labelSyncEnabled?.value ?? labelSyncEnabled) {
      const labelResult = await syncLabelPlaylists(user.id, bandName)
      results.labelsPushed = labelResult.pushed
      results.labelsImported = labelResult.imported
    }

    console.log('Sync results:', results)
    return results
  } finally {
    syncInFlight = false
  }
}

// --- Source playlist sync ---

async function syncSourcePlaylist(playlistId) {
  const songs = db.getAllSongs()

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

// --- Label playlist sync ---

const LABEL_NAMES = {
  fresh: 'Fresh',
  'getting-there': 'Getting There',
  'in-setlist': 'In Setlist',
}

async function syncLabelPlaylists(userId, bandName) {
  const songs = db.getAllSongs()
  const mappings = db.getSetting('spotify_label_playlists') || {}

  let pushed = 0
  let imported = 0

  for (const [labelKey, labelDisplayName] of Object.entries(LABEL_NAMES)) {
    // Songs with this label that have Spotify track IDs
    const labelSongs = songs.filter(s => s.label === labelKey && s.spotifyTrackId)
    const localTrackIds = new Set(labelSongs.map(s => s.spotifyTrackId))

    // Get or create the playlist
    let playlistId = mappings[labelKey]
    if (!playlistId && labelSongs.length === 0) continue // Don't create empty playlists

    if (!playlistId && labelSongs.length > 0) {
      // Create the playlist
      const playlistName = bandName ? `${bandName} — ${labelDisplayName}` : labelDisplayName
      playlistId = await createPlaylist(userId, playlistName)
      mappings[labelKey] = playlistId
      db.setSetting('spotify_label_playlists', mappings)
      console.log(`Created Spotify playlist: "${playlistName}" (${playlistId})`)
    }

    if (!playlistId) continue

    // Fetch current playlist tracks
    const playlistTracks = await getPlaylistTracks(playlistId)
    const remoteTrackIds = new Set(playlistTracks.filter(t => t.id).map(t => t.id))

    // Push: add local songs missing from Spotify
    const toAdd = labelSongs.filter(s => !remoteTrackIds.has(s.spotifyTrackId))
    if (toAdd.length > 0) {
      const uris = toAdd.map(s => `spotify:track:${s.spotifyTrackId}`)
      await addTracksToPlaylist(playlistId, uris)
      pushed += toAdd.length
      console.log(`Label sync: added ${toAdd.length} tracks to "${labelDisplayName}"`)
    }

    // Push: remove Spotify tracks whose local label no longer matches
    const toRemove = playlistTracks.filter(t => t.id && !localTrackIds.has(t.id))
    // Only remove tracks that ARE in our library with a different label
    const allSongsByTrackId = new Map(songs.filter(s => s.spotifyTrackId).map(s => [s.spotifyTrackId, s]))
    const actualRemoves = toRemove.filter(t => {
      const song = allSongsByTrackId.get(t.id)
      return song && song.label !== labelKey
    })
    if (actualRemoves.length > 0) {
      const uris = actualRemoves.map(t => `spotify:track:${t.id}`)
      await removeTracksFromPlaylist(playlistId, uris)
      console.log(`Label sync: removed ${actualRemoves.length} tracks from "${labelDisplayName}"`)
    }

    // Pull: import tracks added on Spotify that aren't in our library
    const existingNormalized = new Map(songs.map(s => [normalize(s.title), s]))
    for (const track of playlistTracks) {
      if (track.type !== 'track') continue
      const title = `${track.artist} \u2014 ${track.name}`
      const existing = existingNormalized.get(normalize(title))
      if (existing) {
        // Update label if different
        if (existing.label !== labelKey) {
          db.updateSong(existing.id, { label: labelKey })
        }
        continue
      }

      // New song — import
      const lyrics = await fetchLrcLibLyrics(track.artist, track.name)

      const defaults = db.getSetting('userDefaults') || {}
      db.upsertSong({
        title,
        lyrics,
        label: labelKey,
        fontAdjust: 0,
        merge: defaults.merge || false,
        separators: defaults.separators || false,
        altColors: defaults.altColors !== false,
        spotifyTrackId: track.id || null,
        albumArt: track.albumArt || null,
      })
      imported++
      console.log(`Label sync: imported "${track.name}" from "${labelDisplayName}" playlist`)
    }
  }

  return { pushed, imported }
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

async function createPlaylist(userId, name) {
  const res = await spotifyFetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      public: false,
      description: 'Managed by LyricMachine',
    }),
  })
  const data = await res.json()
  return data.id
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

async function removeTracksFromPlaylist(playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100)
    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracks: batch.map(uri => ({ uri })),
      }),
    })
  }
}
