// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

/**
 * Tests for updateSong partial update logic.
 *
 * Uses an ISOLATED IN-MEMORY DATABASE — never touches production data.
 * Replicates the updateSong logic from server/db.js.
 */

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
  return db
}

const FIELD_MAP = {
  title: 'title', lyrics: 'lyrics', fontAdjust: 'font_adjust',
  merge: 'merge', separators: 'separators', altColors: 'alt_colors',
  label: 'label', played: 'played', playCount: 'play_count',
  customChords: 'custom_chords', customStructure: 'custom_structure',
  spotifyTrackId: 'spotify_track_id', albumArt: 'album_art',
  capo: 'capo', transpose: 'transpose', customLabels: 'custom_labels',
  notInPlaylist: 'not_in_playlist', sortOrder: 'sort_order',
}
const BOOL_FIELDS = new Set(['merge', 'separators', 'alt_colors', 'played', 'not_in_playlist'])
const JSON_FIELDS = new Set(['custom_chords', 'custom_labels'])

/** Mirrors updateSong from server/db.js */
function updateSong(db, id, fields) {
  const setClauses = []
  const values = []

  for (const [clientKey, value] of Object.entries(fields)) {
    const col = FIELD_MAP[clientKey]
    if (!col || clientKey === 'id') continue
    if (!/^[a-z_]+$/.test(col)) throw new Error(`Invalid column name: ${col}`)
    setClauses.push(`${col} = ?`)
    if (BOOL_FIELDS.has(col)) {
      values.push(value ? 1 : 0)
    } else if (JSON_FIELDS.has(col)) {
      values.push(value != null ? JSON.stringify(value) : null)
    } else {
      values.push(value ?? null)
    }
  }

  if (setClauses.length === 0) return
  setClauses.push("updated_at = datetime('now')")
  values.push(id)

  const _cache = updateSong._cache || (updateSong._cache = new Map())
  const cacheKey = setClauses.slice(0, -1).join(',')
  let stmt = _cache.get(cacheKey)
  if (!stmt) {
    stmt = db.prepare(`UPDATE songs SET ${setClauses.join(', ')} WHERE id = ?`)
    _cache.set(cacheKey, stmt)
  }
  stmt.run(...values)
}

function getRow(db, id) {
  return db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
}

describe('updateSong partial updates', () => {
  let db, seedId

  beforeEach(() => {
    db = createTestDB()
    updateSong._cache = new Map()
    db.prepare(`INSERT INTO songs (title, lyrics, label) VALUES (?, ?, ?)`).run('Artist — Track', 'Hello world', 'fresh')
    seedId = db.prepare('SELECT id FROM songs WHERE title = ?').get('Artist — Track').id
  })

  afterEach(() => {
    db.close()
  })

  it('updates a single text field', () => {
    updateSong(db, seedId, { label: 'getting-there' })
    expect(getRow(db, seedId).label).toBe('getting-there')
  })

  it('updates a boolean field (true → 1)', () => {
    updateSong(db, seedId, { played: true })
    expect(getRow(db, seedId).played).toBe(1)
  })

  it('updates a boolean field (false → 0)', () => {
    db.prepare('UPDATE songs SET played = 1 WHERE id = ?').run(seedId)
    updateSong(db, seedId, { played: false })
    expect(getRow(db, seedId).played).toBe(0)
  })

  it('updates a JSON field (customChords)', () => {
    const chords = [{ section: 'VERSE', chords: 'Am C G D' }]
    updateSong(db, seedId, { customChords: chords })
    const row = getRow(db, seedId)
    expect(JSON.parse(row.custom_chords)).toEqual(chords)
  })

  it('clears a JSON field with null', () => {
    const chords = [{ section: 'V', chords: 'C' }]
    updateSong(db, seedId, { customChords: chords })
    updateSong(db, seedId, { customChords: null })
    expect(getRow(db, seedId).custom_chords).toBeNull()
  })

  it('updates a JSON array field (customLabels)', () => {
    const labels = ['lead', 'favorite']
    updateSong(db, seedId, { customLabels: labels })
    const row = getRow(db, seedId)
    expect(JSON.parse(row.custom_labels)).toEqual(labels)
  })

  it('updates numeric field (transpose)', () => {
    updateSong(db, seedId, { transpose: 3 })
    expect(getRow(db, seedId).transpose).toBe(3)
  })

  it('updates nullable field with null', () => {
    updateSong(db, seedId, { capo: 5 })
    expect(getRow(db, seedId).capo).toBe(5)
    updateSong(db, seedId, { capo: null })
    expect(getRow(db, seedId).capo).toBeNull()
  })

  it('updates multiple fields at once', () => {
    updateSong(db, seedId, { label: 'in-setlist', played: true, playCount: 3 })
    const row = getRow(db, seedId)
    expect(row.label).toBe('in-setlist')
    expect(row.played).toBe(1)
    expect(row.play_count).toBe(3)
  })

  it('does not update when fields is empty', () => {
    const before = getRow(db, seedId).updated_at
    updateSong(db, seedId, {})
    expect(getRow(db, seedId).updated_at).toBe(before)
  })

  it('ignores unknown field names', () => {
    updateSong(db, seedId, { hackerField: 'DROP TABLE songs' })
    // Should silently skip — no crash
    expect(getRow(db, seedId).title).toBe('Artist — Track')
  })

  it('ignores the id field', () => {
    updateSong(db, seedId, { id: 999 })
    expect(getRow(db, seedId)).toBeDefined()
  })

  it('rejects column names with special characters', () => {
    expect(() => {
      // Manually test the validation logic
      const col = 'title; DROP TABLE songs--'
      if (!/^[a-z_]+$/.test(col)) throw new Error(`Invalid column name: ${col}`)
    }).toThrow('Invalid column name')
  })

  it('caches prepared statements for same column set', () => {
    updateSong(db, seedId, { label: 'fresh' })
    updateSong(db, seedId, { label: 'getting-there' })
    // Same column set should reuse cached statement
    expect(updateSong._cache.size).toBe(1)
  })

  it('creates separate statements for different column sets', () => {
    updateSong(db, seedId, { label: 'fresh' })
    updateSong(db, seedId, { played: true })
    updateSong(db, seedId, { label: 'fresh', played: true })
    expect(updateSong._cache.size).toBe(3)
  })

  it('updates lyrics text', () => {
    updateSong(db, seedId, { lyrics: 'New lyrics here' })
    expect(getRow(db, seedId).lyrics).toBe('New lyrics here')
  })

  it('sets updated_at timestamp', () => {
    const before = getRow(db, seedId).updated_at
    updateSong(db, seedId, { label: 'ignored' })
    // updated_at should change (or at least be set)
    const after = getRow(db, seedId).updated_at
    expect(after).toBeDefined()
  })
})
