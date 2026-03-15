import { getSpotifyToken } from './spotify.js'

// --- In-memory cache (24h TTL) ---
let cachedArts = null
let cacheExpiry = 0

export async function handlePopularArt(req, res) {
  try {
    // Return cached result if fresh
    if (cachedArts && Date.now() < cacheExpiry) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ arts: cachedArts }))
      return
    }

    const token = await getSpotifyToken()
    const arts = []
    const seenKeys = new Set()

    // --- Phase 1: Albums from playlist artists ---
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID
    if (playlistId) {
      // Get artist IDs from the playlist
      const plRes = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(artists(id,name),album(images))),next&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (plRes.ok) {
        const plData = await plRes.json()
        const artistIds = new Set()
        const playlistArtKeys = new Set()

        for (const item of (plData.items || [])) {
          if (!item.track) continue
          // Track which album arts are already in the playlist
          const img = item.track.album?.images?.[1]?.url || item.track.album?.images?.[0]?.url
          if (img) playlistArtKeys.add(img)
          // Collect unique artist IDs
          for (const a of (item.track.artists || [])) {
            if (a.id) artistIds.add(a.id)
          }
        }

        // Fetch albums for each artist (limit to first 15 artists to avoid rate limits)
        const artistList = [...artistIds].slice(0, 15)
        for (const artistId of artistList) {
          try {
            const albumRes = await fetch(
              `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=10`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!albumRes.ok) continue
            const albumData = await albumRes.json()
            for (const album of (albumData.items || [])) {
              const images = album.images || []
              const art = images.length > 1 ? images[1].url : (images[0]?.url || null)
              if (!art || !art.includes('/ab67616d')) continue
              if (playlistArtKeys.has(art) || seenKeys.has(art)) continue
              seenKeys.add(art)
              arts.push(art)
            }
          } catch { /* skip artist on error */ }
        }
      }
    }

    console.log(`Popular art: ${arts.length} from playlist artists`)

    // --- Phase 2: Genre search fallback if still need more ---
    if (arts.length < 60) {
      for (const genre of ['grunge', 'punk']) {
        const searchRes = await fetch(
          `https://api.spotify.com/v1/search?q=genre%3A${genre}&type=track&limit=50&offset=0`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!searchRes.ok) continue
        const data = await searchRes.json()
        const seenArtists = new Set()
        for (const t of (data.tracks?.items || [])) {
          const artist = t.artists?.[0]?.name?.toLowerCase() || ''
          if (!artist || seenArtists.has(artist)) continue
          const albumType = t.album?.album_type
          if (albumType === 'compilation') continue
          const images = t.album?.images || []
          const art = images.length > 1 ? images[1].url : (images[0]?.url || null)
          if (!art || !art.includes('/ab67616d')) continue
          if (seenKeys.has(art)) continue
          seenArtists.add(artist)
          seenKeys.add(art)
          arts.push(art)
        }
      }
      console.log(`Popular art: ${arts.length} total after genre fallback`)
    }

    // Cache for 24 hours
    cachedArts = arts
    cacheExpiry = Date.now() + 24 * 60 * 60 * 1000

    console.log(`Popular art: serving ${arts.length} unique album arts`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ arts }))
  } catch (err) {
    console.error('Popular art error:', err.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}
