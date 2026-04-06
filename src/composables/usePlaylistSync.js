import { normalize } from '../utils/normalize.js'
import { api } from '../api.js'
import { useToast } from './useToast.js'

export function usePlaylistSync(favorites, userDefaults) {

  async function syncPlaylist() {
    const { showToast, updateToast, dismissToast } = useToast()
    const toastId = showToast('Syncing Spotify...', { type: 'info', duration: 0 })
    try {
      const data = await api.getPlaylistTracks()
      if (!data?.tracks?.length) {
        updateToast(toastId, 'Sync complete. No tracks found.', 'info')
        setTimeout(() => dismissToast(toastId), 3000)
        return
      }

      const favs = favorites.value
      const existingNormalized = new Set(favs.map(f => normalize(f.title)))
      const newTracks = data.tracks.filter(t => !existingNormalized.has(normalize(t.title)))

      if (newTracks.length === 0) {
        updateToast(toastId, 'Sync complete. No new tracks.', 'info')
        setTimeout(() => dismissToast(toastId), 3000)
        return
      }

      console.log(`Playlist sync: fetching lyrics for ${newTracks.length} new songs...`)
      updateToast(toastId, `Syncing... fetching lyrics for ${newTracks.length} tracks`, 'info')

      for (const t of newTracks) {
        let lyrics = ''
        let syncedLyrics = null
        try {
          const q = `${t.artist} ${t.track}`
          const lrcRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
          if (lrcRes.ok) {
            const lrcData = await lrcRes.json()
            // Prefer exact match with synced lyrics
            const exactSynced = lrcData.find(r =>
              r.plainLyrics && r.syncedLyrics &&
              normalize(r.artistName) === normalize(t.artist) &&
              normalize(r.trackName) === normalize(t.track)
            )
            const exactPlain = lrcData.find(r =>
              r.plainLyrics &&
              normalize(r.artistName) === normalize(t.artist) &&
              normalize(r.trackName) === normalize(t.track)
            )
            const fallbackSynced = lrcData.find(r => r.plainLyrics && r.syncedLyrics)
            const fallback = lrcData.find(r => r.plainLyrics)
            const best = exactSynced || exactPlain || fallbackSynced || fallback
            lyrics = best?.plainLyrics || ''
            syncedLyrics = best?.syncedLyrics || null
          }
        } catch (e) {
          console.warn(`Lyrics fetch failed for "${t.title}":`, e.message)
        }

        const newSong = {
          title: t.title,
          lyrics,
          syncedLyrics,
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

        console.log(`Playlist sync: added "${t.track}" ${lyrics ? '(with lyrics)' : '(no lyrics found)'}${syncedLyrics ? ' [synced]' : ''}`)
      }
      
      updateToast(toastId, `Sync complete. Added ${newTracks.length} tracks.`, 'success')
      setTimeout(() => dismissToast(toastId), 3000)
    } catch (e) {
      console.error('Playlist sync failed:', e.message)
      updateToast(toastId, 'Spotify sync failed', 'error')
      setTimeout(() => dismissToast(toastId), 3000)
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
          const data = await api.getSpotifyId(artist, track)
          if (!data) continue
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

  async function backfillSyncedLyrics() {
    try {
      const favs = favorites.value
      // Songs that have lyrics but no synced lyrics, and have a parseable "Artist — Track" title
      const missing = favs.filter(f => f.hasLyrics && !f.hasSynced && f.title.includes(' — '))
      if (!missing.length) return

      console.log(`Synced lyrics backfill: ${missing.length} songs missing synced lyrics`)
      let saved = 0

      // Process in batches of 5 to avoid hammering lrclib
      const BATCH = 5
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH)
        const results = await Promise.all(batch.map(async (fav) => {
          const parts = fav.title.split(' — ')
          const artist = parts[0].trim()
          const track = parts[1].trim()
          try {
            const q = `${artist} ${track}`
            const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)
            if (!res.ok) return null
            const data = await res.json()
            // Find a result with synced lyrics, prefer exact match
            const exactSynced = data.find(r =>
              r.syncedLyrics &&
              normalize(r.artistName) === normalize(artist) &&
              normalize(r.trackName) === normalize(track)
            )
            const fallbackSynced = data.find(r => r.syncedLyrics)
            return { fav, syncedLyrics: (exactSynced || fallbackSynced)?.syncedLyrics || null }
          } catch {
            return null
          }
        }))

        for (const result of results) {
          if (!result?.syncedLyrics) continue
          result.fav.hasSynced = true
          result.fav.syncedLyrics = result.syncedLyrics
          if (result.fav.id) {
            api.updateSong(result.fav.id, { syncedLyrics: result.syncedLyrics })
          }
          saved++
        }
      }
      console.log(`Synced lyrics backfill: updated ${saved} of ${missing.length} songs`)
    } catch (e) {
      console.error('Synced lyrics backfill failed:', e.message)
    }
  }

  return { syncPlaylist, backfillAlbumArt, backfillSyncedLyrics }
}
