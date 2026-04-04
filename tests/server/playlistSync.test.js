// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

/**
 * Integration tests for playlist sync engine logic.
 *
 * Uses an ISOLATED IN-MEMORY DATABASE — never touches production data.
 * Mocks Spotify API and lrclib to test the sync logic in isolation.
 */

// --- Schema ---
function createTestDB() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE songs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      lyrics          TEXT DEFAULT '',
      font_adjust     INTEGER DEFAULT 0,
      merge           INTEGER DEFAULT 0,
      separators      INTEGER DEFAULT 0,
      alt_colors      INTEGER DEFAULT 1,
      label           TEXT DEFAULT 'fresh',
      played          INTEGER DEFAULT 0,
      play_count      INTEGER DEFAULT 0,
      custom_chords   TEXT,
      custom_structure TEXT DEFAULT '',
      spotify_track_id TEXT,
      album_art       TEXT,
      capo            INTEGER,
      transpose       INTEGER DEFAULT 0,
      custom_labels   TEXT DEFAULT '[]',
      not_in_playlist INTEGER DEFAULT 0,
      sort_order      INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  try {
    db.exec(`CREATE UNIQUE INDEX idx_songs_title_trackid ON songs(title, COALESCE(spotify_track_id, ''))`)
  } catch { /* ignore if exists */ }
  return db
}

// --- Helper: replicate normalize from shared ---
function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// --- Helper: replicate core sync logic without module imports ---
function rowToSong(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    lyrics: row.lyrics,
    spotifyTrackId: row.spotify_track_id,
    albumArt: row.album_art,
    notInPlaylist: !!row.not_in_playlist,
  }
}

function getAllSongs(db) {
  return db.prepare('SELECT * FROM songs ORDER BY sort_order ASC, id ASC').all().map(rowToSong)
}

function upsertSong(db, song) {
  const existing = db.prepare(
    "SELECT * FROM songs WHERE title = ? AND COALESCE(spotify_track_id, '') = COALESCE(?, '')"
  ).get(song.title, song.spotifyTrackId || null)
  if (existing) {
    db.prepare('UPDATE songs SET lyrics = ?, album_art = ? WHERE id = ?')
      .run(song.lyrics || '', song.albumArt || null, existing.id)
    return
  }
  const byTitle = db.prepare('SELECT * FROM songs WHERE title = ?').get(song.title)
  if (byTitle && !song.spotifyTrackId) return

  db.prepare(`INSERT INTO songs (title, lyrics, spotify_track_id, album_art, merge, separators, alt_colors)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(song.title, song.lyrics || '', song.spotifyTrackId || null, song.albumArt || null,
      song.merge ? 1 : 0, song.separators ? 1 : 0, song.altColors !== false ? 1 : 0)
}

function updateSong(db, id, fields) {
  if (fields.notInPlaylist !== undefined) {
    db.prepare('UPDATE songs SET not_in_playlist = ? WHERE id = ?').run(fields.notInPlaylist ? 1 : 0, id)
  }
}

/** Core sync logic — mirrors syncSourcePlaylist */
async function syncSourcePlaylist(db, playlistTracks, fetchLyrics) {
  const songs = getAllSongs(db)
  const playlistTrackIds = new Set(playlistTracks.filter(t => t.id).map(t => t.id))
  const existingNormalized = new Map(songs.map(s => [normalize(s.title), s]))

  let imported = 0
  let markedRemoved = 0

  const newTracks = playlistTracks.filter(track => {
    if (track.type !== 'track') return false
    const title = `${track.artist} — ${track.name}`
    return !existingNormalized.has(normalize(title))
  })

  for (const track of newTracks) {
    const lyrics = await fetchLyrics(track.artist, track.name)
    const title = `${track.artist} — ${track.name}`
    upsertSong(db, {
      title,
      lyrics,
      merge: false,
      separators: false,
      altColors: true,
      spotifyTrackId: track.id || null,
      albumArt: track.albumArt || null,
    })
    imported++
  }

  for (const song of songs) {
    if (!song.spotifyTrackId) continue
    if (!playlistTrackIds.has(song.spotifyTrackId) && !song.notInPlaylist) {
      updateSong(db, song.id, { notInPlaylist: true })
      markedRemoved++
    }
    if (playlistTrackIds.has(song.spotifyTrackId) && song.notInPlaylist) {
      updateSong(db, song.id, { notInPlaylist: false })
    }
  }

  return { imported, markedRemoved }
}

describe('playlist sync engine', () => {
  let db

  beforeEach(() => {
    db = createTestDB()
  })

  afterEach(() => {
    db.close()
  })

  it('imports new tracks from playlist', async () => {
    const tracks = [
      { id: 't1', name: 'Song One', artist: 'Artist A', albumArt: 'art1.jpg', type: 'track' },
      { id: 't2', name: 'Song Two', artist: 'Artist B', albumArt: 'art2.jpg', type: 'track' },
    ]
    const fetchLyrics = vi.fn().mockResolvedValue('Some lyrics')

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)

    expect(result.imported).toBe(2)
    const songs = getAllSongs(db)
    expect(songs).toHaveLength(2)
    expect(songs[0].title).toBe('Artist A — Song One')
    expect(songs[0].lyrics).toBe('Some lyrics')
    expect(songs[0].spotifyTrackId).toBe('t1')
  })

  it('skips already existing songs', async () => {
    db.prepare(`INSERT INTO songs (title, spotify_track_id) VALUES (?, ?)`).run('Artist A — Song One', 't1')

    const tracks = [
      { id: 't1', name: 'Song One', artist: 'Artist A', type: 'track' },
      { id: 't2', name: 'Song Two', artist: 'Artist B', type: 'track' },
    ]
    const fetchLyrics = vi.fn().mockResolvedValue('')

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)
    expect(result.imported).toBe(1)
    expect(getAllSongs(db)).toHaveLength(2)
  })

  it('skips podcast episodes (type !== track)', async () => {
    const tracks = [
      { id: 'e1', name: 'Podcast Ep', artist: 'Host', type: 'episode' },
      { id: 't1', name: 'Real Song', artist: 'Artist', type: 'track' },
    ]
    const fetchLyrics = vi.fn().mockResolvedValue('')

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)
    expect(result.imported).toBe(1)
    expect(getAllSongs(db)).toHaveLength(1)
  })

  it('marks songs as not-in-playlist when removed', async () => {
    db.prepare(`INSERT INTO songs (title, spotify_track_id) VALUES (?, ?)`).run('Old Song — Title', 'removed_id')

    const tracks = [] // empty playlist
    const fetchLyrics = vi.fn()

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)
    expect(result.markedRemoved).toBe(1)
    const row = db.prepare('SELECT not_in_playlist FROM songs WHERE spotify_track_id = ?').get('removed_id')
    expect(row.not_in_playlist).toBe(1)
  })

  it('clears not-in-playlist flag when song returns', async () => {
    db.prepare(`INSERT INTO songs (title, spotify_track_id, not_in_playlist) VALUES (?, ?, ?)`).run('Back Song — Title', 'back_id', 1)

    const tracks = [
      { id: 'back_id', name: 'Title', artist: 'Back Song', type: 'track' },
    ]
    const fetchLyrics = vi.fn()

    await syncSourcePlaylist(db, tracks, fetchLyrics)
    const row = db.prepare('SELECT not_in_playlist FROM songs WHERE spotify_track_id = ?').get('back_id')
    expect(row.not_in_playlist).toBe(0)
  })

  it('handles empty playlist without crashing', async () => {
    const result = await syncSourcePlaylist(db, [], vi.fn())
    expect(result.imported).toBe(0)
    expect(result.markedRemoved).toBe(0)
  })

  it('does not mark manual songs (no spotify_track_id) as removed', async () => {
    db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Manual Song')

    const result = await syncSourcePlaylist(db, [], vi.fn())
    expect(result.markedRemoved).toBe(0)
    const row = db.prepare('SELECT not_in_playlist FROM songs WHERE title = ?').get('Manual Song')
    expect(row.not_in_playlist).toBe(0)
  })

  it('stores album art from playlist', async () => {
    const tracks = [
      { id: 't1', name: 'Art Song', artist: 'Artist', albumArt: 'https://img.com/art.jpg', type: 'track' },
    ]
    const fetchLyrics = vi.fn().mockResolvedValue('')

    await syncSourcePlaylist(db, tracks, fetchLyrics)
    const row = db.prepare('SELECT album_art FROM songs WHERE spotify_track_id = ?').get('t1')
    expect(row.album_art).toBe('https://img.com/art.jpg')
  })

  it('handles lyrics fetch failure gracefully', async () => {
    const tracks = [
      { id: 't1', name: 'No Lyrics', artist: 'Artist', type: 'track' },
    ]
    const fetchLyrics = vi.fn().mockResolvedValue(null)

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)
    expect(result.imported).toBe(1)
    // Song should exist with empty lyrics
    const songs = getAllSongs(db)
    expect(songs[0].lyrics).toBe('')
  })

  it('uses title normalization for deduplication', async () => {
    // Existing song with slightly different formatting
    db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('ARTIST — SONG')

    const tracks = [
      { id: 't1', name: 'Song', artist: 'Artist', type: 'track' },
    ]
    const fetchLyrics = vi.fn()

    const result = await syncSourcePlaylist(db, tracks, fetchLyrics)
    // normalize('Artist — Song') === normalize('ARTIST — SONG'), so it should skip
    expect(result.imported).toBe(0)
  })
})
