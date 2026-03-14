export function usePlaylistSync(getFavorites, saveFavoritesArray, userDefaults) {
  // Normalize title for comparison
  const normalize = (s) => s.toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D`\u00B4\u2032\u2033']/g, "'")
    .replace(/[\u2014\u2013\u2012\u2015]/g, '-')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  async function syncPlaylist() {
    try {
      const res = await fetch('/api/playlist-tracks')
      const data = await res.json()
      if (!data.tracks || !data.tracks.length) return

      let favs = getFavorites()

      // Clean up broken entries
      const withLyrics = new Set()
      for (const f of favs) {
        if (f.lyrics) withLyrics.add(normalize(f.title))
      }
      const beforeCount = favs.length
      favs = favs.filter(f => {
        if (!f.lyrics && withLyrics.has(normalize(f.title))) return false
        return true
      })
      if (favs.length < beforeCount) {
        console.log(`Playlist sync: cleaned ${beforeCount - favs.length} broken entries`)
      }

      const existingNormalized = new Set(favs.map(f => normalize(f.title)))
      const newTracks = data.tracks.filter(t => !existingNormalized.has(normalize(t.title)))

      if (newTracks.length === 0 && favs.length === beforeCount) return
      if (favs.length < beforeCount) {
        saveFavoritesArray(favs)
      }

      if (newTracks.length > 0) {
        console.log(`Playlist sync: fetching lyrics for ${newTracks.length} new songs...`)
      }

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

        favs.push({
          title: t.title,
          lyrics,
          fontAdjust: 0,
          merge: userDefaults.value.merge || false,
          separators: userDefaults.value.separators || false,
          altColors: userDefaults.value.altColors !== false,
          spotifyTrackId: t.spotifyTrackId || null,
          albumArt: t.albumArt || null,
        })
        existingNormalized.add(normalize(t.title))
        console.log(`Playlist sync: added "${t.track}" ${lyrics ? '(with lyrics)' : '(no lyrics found)'}`)

        saveFavoritesArray(favs)
      }
    } catch (e) {
      console.error('Playlist sync failed:', e.message)
    }
  }

  async function backfillAlbumArt() {
    try {
      const favs = getFavorites()

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
          saved++
          // Batch save every 5
          if (saved % 5 === 0) saveFavoritesArray(favs)
        } catch {}
      }
      if (saved > 0) saveFavoritesArray(favs)
      console.log(`Album art backfill: updated ${saved} songs`)
    } catch (e) {
      console.error('Album art backfill failed:', e.message)
    }
  }

  return { syncPlaylist, backfillAlbumArt }
}
