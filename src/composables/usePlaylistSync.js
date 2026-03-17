import { normalize } from '../utils/normalize.js'
import { api } from '../api.js'

export function usePlaylistSync(favorites, userDefaults) {

  async function syncPlaylist() {
    try {
      const data = await api.getPlaylistTracks()
      if (!data?.tracks?.length) return

      const favs = favorites.value
      const existingNormalized = new Set(favs.map(f => normalize(f.title)))
      const newTracks = data.tracks.filter(t => !existingNormalized.has(normalize(t.title)))

      if (newTracks.length === 0) return

      console.log(`Playlist sync: fetching lyrics for ${newTracks.length} new songs...`)

      for (const t of newTracks) {
        let lyrics = ''
        try {
          const q = `${t.artist} ${t.track}`
          const lrcRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
          if (lrcRes.ok) {
            const lrcData = await lrcRes.json()
            const exact = lrcData.find(r =>
              r.plainLyrics &&
              normalize(r.artistName) === normalize(t.artist) &&
              normalize(r.trackName) === normalize(t.track)
            )
            const fallback = lrcData.find(r => r.plainLyrics)
            lyrics = (exact || fallback)?.plainLyrics || ''
          }
        } catch (e) {
          console.warn(`Lyrics fetch failed for "${t.title}":`, e.message)
        }

        const newSong = {
          title: t.title,
          lyrics,
          fontAdjust: 0,
          merge: userDefaults.value.merge || false,
          separators: userDefaults.value.separators || false,
          altColors: userDefaults.value.altColors !== false,
          spotifyTrackId: t.spotifyTrackId || null,
          albumArt: t.albumArt || null,
        }

        const created = await api.createSong(newSong)
        if (created) {
          favs.push(created)
          existingNormalized.add(normalize(t.title))
        }

        console.log(`Playlist sync: added "${t.track}" ${lyrics ? '(with lyrics)' : '(no lyrics found)'}`)
      }
    } catch (e) {
      console.error('Playlist sync failed:', e.message)
    }
  }

  async function backfillAlbumArt() {
    try {
      const favs = favorites.value
      const missing = favs.filter(f => !f.albumArt && f.title.includes(' — '))
      if (!missing.length) return

      console.log(`Album art backfill: ${missing.length} songs missing art`)
      let saved = 0

      for (const fav of missing) {
        const parts = fav.title.split(' — ')
        const artist = parts[0].trim()
        const track = parts[1].trim()
        try {
          const res = await fetch(
            `/api/spotify-id?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`
          )
          if (!res.ok) continue
          const data = await res.json()
          if (data.albumArt) fav.albumArt = data.albumArt
          if (data.spotifyTrackId && !fav.spotifyTrackId) fav.spotifyTrackId = data.spotifyTrackId

          if (fav.id) {
            const update = {}
            if (data.albumArt) update.albumArt = data.albumArt
            if (data.spotifyTrackId) update.spotifyTrackId = data.spotifyTrackId
            api.updateSong(fav.id, update)
          }
          saved++
        } catch {}
      }
      console.log(`Album art backfill: updated ${saved} songs`)
    } catch (e) {
      console.error('Album art backfill failed:', e.message)
    }
  }

  return { syncPlaylist, backfillAlbumArt }
}
