// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

/**
 * Integration tests for server/db.js logic.
 *
 * Uses an ISOLATED IN-MEMORY DATABASE — never touches production data.
 * We replicate the schema and test the SQL logic directly.
 */

function createTestDB() {
  const db = new DatabaseSync(':memory:')

  db.exec(`
    CREATE TABLE songs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL UNIQUE,
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
      not_in_playlist INTEGER DEFAULT 0,
      sort_order      INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  return db
}

// --- Helper functions that mirror db.js logic ---

function rowToSong(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    lyrics: row.lyrics,
    fontAdjust: row.font_adjust,
    merge: !!row.merge,
    separators: !!row.separators,
    altColors: !!row.alt_colors,
    label: row.label,
    played: !!row.played,
    playCount: row.play_count,
    customChords: row.custom_chords ? JSON.parse(row.custom_chords) : undefined,
    customStructure: row.custom_structure || '',
    spotifyTrackId: row.spotify_track_id,
    albumArt: row.album_art,
    capo: row.capo,
    notInPlaylist: !!row.not_in_playlist,
    sortOrder: row.sort_order,
  }
}

const FIELD_MAP = {
  title: 'title', lyrics: 'lyrics', fontAdjust: 'font_adjust',
  merge: 'merge', separators: 'separators', altColors: 'alt_colors',
  label: 'label', played: 'played', playCount: 'play_count',
  customChords: 'custom_chords', customStructure: 'custom_structure',
  spotifyTrackId: 'spotify_track_id', albumArt: 'album_art',
  capo: 'capo', notInPlaylist: 'not_in_playlist', sortOrder: 'sort_order',
}
const BOOL_FIELDS = new Set(['merge', 'separators', 'alt_colors', 'played', 'not_in_playlist'])
const JSON_FIELDS = new Set(['custom_chords'])

describe('db integration (isolated)', () => {
  let db

  beforeEach(() => {
    db = createTestDB()
  })

  afterEach(() => {
    db.close()
  })

  // --- Songs CRUD ---

  describe('INSERT + SELECT', () => {
    it('creates a song and retrieves it', () => {
      db.prepare(`INSERT INTO songs (title, lyrics) VALUES (?, ?)`).run('Artist — Track', 'Hello world')
      const row = db.prepare('SELECT * FROM songs WHERE title = ?').get('Artist — Track')
      const song = rowToSong(row)
      expect(song.title).toBe('Artist — Track')
      expect(song.lyrics).toBe('Hello world')
    })

    it('applies default values', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Defaults Test')
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE title = ?').get('Defaults Test'))
      expect(song.fontAdjust).toBe(0)
      expect(song.merge).toBe(false)
      expect(song.separators).toBe(false)
      expect(song.altColors).toBe(true)
      expect(song.label).toBe('fresh')
      expect(song.played).toBe(false)
      expect(song.playCount).toBe(0)
      expect(song.notInPlaylist).toBe(false)
    })

    it('stores boolean fields correctly', () => {
      db.prepare(`INSERT INTO songs (title, merge, separators, alt_colors) VALUES (?, ?, ?, ?)`).run('Bool Test', 1, 1, 0)
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE title = ?').get('Bool Test'))
      expect(song.merge).toBe(true)
      expect(song.separators).toBe(true)
      expect(song.altColors).toBe(false)
    })

    it('stores and retrieves custom chords as JSON', () => {
      const chords = [{ section: 'VERSE', chords: 'Am C G D' }]
      db.prepare(`INSERT INTO songs (title, custom_chords) VALUES (?, ?)`).run('Chords Test', JSON.stringify(chords))
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE title = ?').get('Chords Test'))
      expect(song.customChords).toEqual(chords)
    })

    it('enforces unique titles', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Unique')
      expect(() => db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Unique')).toThrow()
    })
  })

  describe('SELECT queries', () => {
    it('returns all songs ordered by sort_order', () => {
      db.prepare(`INSERT INTO songs (title, sort_order) VALUES (?, ?)`).run('Song Z', 2)
      db.prepare(`INSERT INTO songs (title, sort_order) VALUES (?, ?)`).run('Song A', 1)
      const songs = db.prepare('SELECT * FROM songs ORDER BY sort_order ASC, id ASC').all().map(rowToSong)
      expect(songs).toHaveLength(2)
      expect(songs[0].title).toBe('Song A')
      expect(songs[1].title).toBe('Song Z')
    })

    it('returns empty array when no songs', () => {
      const songs = db.prepare('SELECT * FROM songs').all()
      expect(songs).toEqual([])
    })

    it('returns correct count', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('One')
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Two')
      expect(db.prepare('SELECT COUNT(*) AS count FROM songs').get().count).toBe(2)
    })

    it('finds by title', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Find Me')
      expect(db.prepare('SELECT * FROM songs WHERE title = ?').get('Find Me')).toBeDefined()
    })

    it('returns undefined for non-existent title', () => {
      expect(db.prepare('SELECT * FROM songs WHERE title = ?').get('Nope')).toBeUndefined()
    })
  })

  describe('UPDATE', () => {
    it('updates specific fields', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Update Me')
      const id = db.prepare('SELECT id FROM songs WHERE title = ?').get('Update Me').id
      db.prepare('UPDATE songs SET label = ?, played = ? WHERE id = ?').run('getting_there', 1, id)
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE id = ?').get(id))
      expect(song.label).toBe('getting_there')
      expect(song.played).toBe(true)
    })

    it('updates custom chords', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Chord Update')
      const id = db.prepare('SELECT id FROM songs WHERE title = ?').get('Chord Update').id
      const chords = [{ section: 'INTRO', chords: 'Em Am' }]
      db.prepare('UPDATE songs SET custom_chords = ? WHERE id = ?').run(JSON.stringify(chords), id)
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE id = ?').get(id))
      expect(song.customChords).toEqual(chords)
    })

    it('clears custom chords', () => {
      const chords = JSON.stringify([{ section: 'V', chords: 'C G' }])
      db.prepare(`INSERT INTO songs (title, custom_chords) VALUES (?, ?)`).run('Clear Chords', chords)
      const id = db.prepare('SELECT id FROM songs WHERE title = ?').get('Clear Chords').id
      db.prepare('UPDATE songs SET custom_chords = NULL WHERE id = ?').run(id)
      const song = rowToSong(db.prepare('SELECT * FROM songs WHERE id = ?').get(id))
      expect(song.customChords).toBeUndefined()
    })
  })

  describe('DELETE', () => {
    it('removes a song by ID', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Delete Me')
      const id = db.prepare('SELECT id FROM songs WHERE title = ?').get('Delete Me').id
      db.prepare('DELETE FROM songs WHERE id = ?').run(id)
      expect(db.prepare('SELECT * FROM songs WHERE id = ?').get(id)).toBeUndefined()
    })
  })

  describe('reorder', () => {
    it('updates sort_order in a transaction', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('First')
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Second')
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Third')

      const ids = db.prepare('SELECT id FROM songs ORDER BY id').all().map(r => r.id)

      // Reverse order
      db.exec('BEGIN')
      const update = db.prepare('UPDATE songs SET sort_order = ? WHERE id = ?')
      update.run(0, ids[2])
      update.run(1, ids[1])
      update.run(2, ids[0])
      db.exec('COMMIT')

      const songs = db.prepare('SELECT * FROM songs ORDER BY sort_order ASC').all().map(rowToSong)
      expect(songs[0].title).toBe('Third')
      expect(songs[1].title).toBe('Second')
      expect(songs[2].title).toBe('First')
    })
  })

  describe('bulk update', () => {
    it('updates a field on all songs', () => {
      db.prepare(`INSERT INTO songs (title, played) VALUES (?, ?)`).run('S1', 0)
      db.prepare(`INSERT INTO songs (title, played) VALUES (?, ?)`).run('S2', 0)
      db.prepare('UPDATE songs SET played = 1 WHERE 1=1').run()
      const songs = db.prepare('SELECT * FROM songs').all().map(rowToSong)
      expect(songs.every(s => s.played)).toBe(true)
    })
  })

  describe('clear all chords', () => {
    it('clears custom chords from all songs', () => {
      const chords = JSON.stringify([{ section: 'V', chords: 'Am' }])
      db.prepare(`INSERT INTO songs (title, custom_chords) VALUES (?, ?)`).run('Has Chords', chords)
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('No Chords')
      db.prepare("UPDATE songs SET custom_chords = NULL, custom_structure = '' WHERE custom_chords IS NOT NULL").run()
      const songs = db.prepare('SELECT * FROM songs').all().map(rowToSong)
      expect(songs.every(s => !s.customChords)).toBe(true)
    })
  })

  // --- Settings ---

  describe('settings', () => {
    it('stores and retrieves JSON', () => {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('test', JSON.stringify({ a: 1 }))
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('test')
      expect(JSON.parse(row.value)).toEqual({ a: 1 })
    })

    it('overwrites existing', () => {
      const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      upsert.run('k', JSON.stringify({ old: true }))
      upsert.run('k', JSON.stringify({ new: true }))
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('k')
      expect(JSON.parse(row.value)).toEqual({ new: true })
    })

    it('returns undefined for missing key', () => {
      expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('missing')).toBeUndefined()
    })
  })

  // --- Import ---

  describe('import', () => {
    it('inserts new songs, skips duplicates', () => {
      db.prepare(`INSERT INTO songs (title) VALUES (?)`).run('Existing')
      const insert = db.prepare('INSERT OR IGNORE INTO songs (title, lyrics) VALUES (?, ?)')
      insert.run('Existing', 'dup')
      insert.run('New', 'new')
      expect(db.prepare('SELECT COUNT(*) as c FROM songs').get().c).toBe(2)
    })
  })

  // --- Column name safety ---

  describe('column name validation', () => {
    it('rejects column names with special characters', () => {
      const col = 'title; DROP TABLE songs--'
      expect(/^[a-z_]+$/.test(col)).toBe(false)
    })

    it('accepts valid column names', () => {
      for (const col of Object.values(FIELD_MAP)) {
        expect(/^[a-z_]+$/.test(col)).toBe(true)
      }
    })
  })
})
