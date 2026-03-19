/**
 * Recovery script: pulls label assignments from Spotify label playlists
 * and updates local songs to match.
 *
 * Run: node server/recover-labels.js
 */
import 'dotenv/config'
import * as db from './db.js'
import { spotifyFetch, normalize, pickAlbumArt } from './utils.js'

const LABEL_NAMES = {
  fresh: 'Fresh',
  'getting-there': 'Getting There',
  'in-setlist': 'In Setlist',
}

async function recoverLabels() {
  const mappings = db.getSetting('spotify_label_playlists')
  if (!mappings) {
    console.error('No spotify_label_playlists setting found')
    process.exit(1)
  }

  console.log('Label playlist mappings:', mappings)

  const songs = db.getAllSongs()
  const songsByNorm = new Map(songs.map(s => [normalize(s.title), s]))
  let recovered = 0

  for (const [label, playlistId] of Object.entries(mappings)) {
    if (!playlistId) continue
    console.log(`\nFetching "${LABEL_NAMES[label] || label}" playlist (${playlistId})...`)

    const tracks = []
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(name))),next&limit=100`

    while (url) {
      const res = await spotifyFetch(url)
      if (!res.ok) {
        console.error(`  Failed to fetch playlist: ${res.status}`)
        break
      }
      const data = await res.json()
      for (const item of (data.items || [])) {
        if (!item.track) continue
        const artist = item.track.artists?.map(a => a.name).join(', ') || 'Unknown'
        tracks.push({ name: item.track.name, artist, id: item.track.id })
      }
      url = data.next || null
    }

    console.log(`  Found ${tracks.length} tracks`)

    for (const track of tracks) {
      const title = `${track.artist} — ${track.name}`
      const norm = normalize(title)
      const song = songsByNorm.get(norm)
      if (song && song.label !== label) {
        db.updateSong(song.id, { label })
        console.log(`  ✓ ${song.title}: ${song.label} → ${label}`)
        recovered++
      }
    }
  }

  console.log(`\nRecovered ${recovered} label assignments`)
}

recoverLabels().catch(err => {
  console.error('Recovery failed:', err)
  process.exit(1)
})
