import { pickAlbumArt } from './utils.js'

// --- Spotify token cache ---
let spotifyToken = null
let tokenExpiry = 0

export async function getSpotifyToken() {
  if (spotifyToken && Date.now() < tokenExpiry) return spotifyToken

  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) throw new Error('Missing Spotify credentials')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })

  const data = await res.json()
  spotifyToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return spotifyToken
}

// --- Spotify track ID lookup ---
export async function handleSpotifyIdRequest(req, res) {
  const artist = req.query?.artist || new URL(req.url, 'http://x').searchParams.get('artist')
  const track = req.query?.track || new URL(req.url, 'http://x').searchParams.get('track')

  if (!artist || !track) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'artist and track required' }))
    return
  }

  try {
    const token = await getSpotifyToken()
    const q = encodeURIComponent(`artist:${artist} track:${track}`)
    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const searchData = await searchRes.json()
    const tracks = searchData.tracks?.items || []

    res.writeHead(200, { 'Content-Type': 'application/json' })
    const firstTrack = tracks[0]
    const albumArt = pickAlbumArt(firstTrack?.album?.images)
    res.end(JSON.stringify({
      spotifyTrackId: firstTrack?.id || null,
      albumArt,
    }))
  } catch (err) {
    console.error('Spotify search error:', err.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Search failed' }))
  }
}

// --- Playlist tracks handler ---
export async function handlePlaylistTracks(req, res) {
  try {
    // Import db lazily to avoid circular imports
    const db = await import('./db.js')
    const sourceSetting = db.getSetting('spotify_source_playlist')
    const playlistId = sourceSetting?.value || sourceSetting || process.env.SPOTIFY_PLAYLIST_ID
    if (!playlistId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No source playlist selected' }))
      return
    }

    const token = await getSpotifyToken()
    const tracks = []
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(name),album(images))),next&limit=100`

    while (url) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const errText = await resp.text()
        console.error('Spotify playlist error:', resp.status, errText)
        res.writeHead(resp.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Spotify API error', status: resp.status }))
        return
      }
      const data = await resp.json()
      for (const item of (data.items || [])) {
        if (!item.track) continue
        const artist = item.track.artists?.map(a => a.name).join(', ') || 'Unknown'
        const track = item.track.name || 'Unknown'
        const albumArt = pickAlbumArt(item.track.album?.images)
        tracks.push({ title: `${artist} \u2014 ${track}`, artist, track, spotifyTrackId: item.track.id, albumArt })
      }
      url = data.next || null
    }

    console.log(`Playlist sync: ${tracks.length} tracks fetched`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ tracks }))
  } catch (e) {
    console.error('Playlist error:', e.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}
