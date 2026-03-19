// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../../server/db.js'

/**
 * Integration tests for server/db.js.
 * These test actual SQLite operations — creates, reads, updates, deletes.
 *
 * Since db.js uses a singleton database, we clean up between tests
 * by deleting all songs and settings.
 */

function cleanup() {
  // Delete all songs
  const songs = db.getAllSongs()
  for (const s of songs) db.deleteSong(s.id)
  // Clear test settings
  db.setSetting('test_key', null)
}

describe('db integration', () => {
  beforeEach(cleanup)

  // --- Songs CRUD ---

  describe('createSong + getSong', () => {
    it('creates a song and retrieves it by ID', () => {
      const song = db.createSong({ title: 'Artist — Track', lyrics: 'Hello world' })
      expect(song).toBeDefined()
      expect(song.id).toBeGreaterThan(0)
      expect(song.title).toBe('Artist — Track')
      expect(song.lyrics).toBe('Hello world')

      const fetched = db.getSong(song.id)
      expect(fetched.title).toBe('Artist — Track')
    })

    it('applies default values', () => {
      const song = db.createSong({ title: 'Defaults Test' })
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
      const song = db.createSong({ title: 'Bool Test', merge: true, separators: true, altColors: false })
      expect(song.merge).toBe(true)
      expect(song.separators).toBe(true)
      expect(song.altColors).toBe(false)
    })

    it('stores and retrieves custom chords as JSON', () => {
      const chords = [{ section: 'VERSE', chords: 'Am C G D' }]
      const song = db.createSong({ title: 'Chords Test', customChords: chords })
      expect(song.customChords).toEqual(chords)
    })

    it('increments sort_order for each new song', () => {
      const a = db.createSong({ title: 'Song A' })
      const b = db.createSong({ title: 'Song B' })
      const c = db.createSong({ title: 'Song C' })
      expect(b.sortOrder).toBeGreaterThan(a.sortOrder)
      expect(c.sortOrder).toBeGreaterThan(b.sortOrder)
    })
  })

  describe('getAllSongs', () => {
    it('returns all songs ordered by sort_order', () => {
      db.createSong({ title: 'Song Z' })
      db.createSong({ title: 'Song A' })
      const songs = db.getAllSongs()
      expect(songs).toHaveLength(2)
      expect(songs[0].sortOrder).toBeLessThanOrEqual(songs[1].sortOrder)
    })

    it('returns empty array when no songs exist', () => {
      expect(db.getAllSongs()).toEqual([])
    })
  })

  describe('getSongByTitle', () => {
    it('finds song by exact title', () => {
      db.createSong({ title: 'Unique Title Here' })
      const song = db.getSongByTitle('Unique Title Here')
      expect(song).toBeDefined()
      expect(song.title).toBe('Unique Title Here')
    })

    it('returns null for non-existent title', () => {
      expect(db.getSongByTitle('Does Not Exist')).toBeNull()
    })
  })

  describe('getSongCount', () => {
    it('returns correct count', () => {
      expect(db.getSongCount()).toBe(0)
      db.createSong({ title: 'One' })
      db.createSong({ title: 'Two' })
      expect(db.getSongCount()).toBe(2)
    })
  })

  describe('updateSong', () => {
    it('updates specific fields', () => {
      const song = db.createSong({ title: 'Update Me' })
      const updated = db.updateSong(song.id, { label: 'getting_there', played: true })
      expect(updated.label).toBe('getting_there')
      expect(updated.played).toBe(true)
      expect(updated.title).toBe('Update Me') // unchanged
    })

    it('updates lyrics', () => {
      const song = db.createSong({ title: 'Lyrics Update', lyrics: 'old' })
      db.updateSong(song.id, { lyrics: 'new lyrics here' })
      expect(db.getSong(song.id).lyrics).toBe('new lyrics here')
    })

    it('updates custom chords (JSON field)', () => {
      const song = db.createSong({ title: 'Chord Update' })
      const chords = [{ section: 'INTRO', chords: 'Em Am' }]
      db.updateSong(song.id, { customChords: chords })
      expect(db.getSong(song.id).customChords).toEqual(chords)
    })

    it('clears custom chords when set to null', () => {
      const chords = [{ section: 'VERSE', chords: 'C G' }]
      const song = db.createSong({ title: 'Clear Chords', customChords: chords })
      db.updateSong(song.id, { customChords: null })
      expect(db.getSong(song.id).customChords).toBeUndefined()
    })

    it('ignores unknown fields', () => {
      const song = db.createSong({ title: 'Unknown Fields' })
      const updated = db.updateSong(song.id, { nonExistentField: 'value' })
      expect(updated.title).toBe('Unknown Fields')
    })

    it('returns null for non-existent ID', () => {
      expect(db.updateSong(999999, { title: 'nope' })).toBeNull()
    })
  })

  describe('upsertSong', () => {
    it('creates new song when title does not exist', () => {
      const song = db.upsertSong({ title: 'Brand New', lyrics: 'new lyrics' })
      expect(song.id).toBeGreaterThan(0)
      expect(song.lyrics).toBe('new lyrics')
    })

    it('updates existing song when title matches', () => {
      db.createSong({ title: 'Existing', lyrics: 'old' })
      const updated = db.upsertSong({ title: 'Existing', lyrics: 'updated' })
      expect(updated.lyrics).toBe('updated')
      expect(db.getSongCount()).toBe(1) // no duplicate
    })
  })

  describe('deleteSong', () => {
    it('removes a song by ID', () => {
      const song = db.createSong({ title: 'Delete Me' })
      db.deleteSong(song.id)
      expect(db.getSong(song.id)).toBeNull()
    })

    it('does not throw for non-existent ID', () => {
      expect(() => db.deleteSong(999999)).not.toThrow()
    })
  })

  describe('reorderSongs', () => {
    it('updates sort_order for given IDs', () => {
      const a = db.createSong({ title: 'First' })
      const b = db.createSong({ title: 'Second' })
      const c = db.createSong({ title: 'Third' })

      // Reverse order
      db.reorderSongs([c.id, b.id, a.id])

      const songs = db.getAllSongs()
      expect(songs[0].title).toBe('Third')
      expect(songs[1].title).toBe('Second')
      expect(songs[2].title).toBe('First')
    })
  })

  describe('bulkUpdateField', () => {
    it('updates a field on all songs', () => {
      db.createSong({ title: 'S1', played: false })
      db.createSong({ title: 'S2', played: false })

      const result = db.bulkUpdateField('played', true)
      expect(result.ok).toBe(true)

      const songs = db.getAllSongs()
      expect(songs.every(s => s.played)).toBe(true)
    })

    it('returns error for unknown field', () => {
      const result = db.bulkUpdateField('fakeField', true)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Unknown field')
    })

    it('handles boolean fields correctly', () => {
      db.createSong({ title: 'Merge Test', merge: true })
      db.bulkUpdateField('merge', false)
      expect(db.getAllSongs()[0].merge).toBe(false)
    })
  })

  describe('clearAllChords', () => {
    it('clears custom chords from all songs', () => {
      db.createSong({ title: 'Has Chords', customChords: [{ section: 'V', chords: 'Am' }] })
      db.createSong({ title: 'No Chords' })

      db.clearAllChords()

      const songs = db.getAllSongs()
      expect(songs.every(s => !s.customChords)).toBe(true)
    })
  })

  // --- Settings ---

  describe('settings', () => {
    it('stores and retrieves JSON settings', () => {
      db.setSetting('test_defaults', { merge: true, separators: false })
      const value = db.getSetting('test_defaults')
      expect(value).toEqual({ merge: true, separators: false })
    })

    it('returns null for non-existent key', () => {
      expect(db.getSetting('nonexistent_key')).toBeNull()
    })

    it('overwrites existing setting', () => {
      db.setSetting('overwrite_test', { a: 1 })
      db.setSetting('overwrite_test', { a: 2, b: 3 })
      expect(db.getSetting('overwrite_test')).toEqual({ a: 2, b: 3 })
    })
  })

  // --- Import ---

  describe('importFavorites', () => {
    it('imports an array of songs', () => {
      const imported = db.importFavorites([
        { title: 'Import A', lyrics: 'la la' },
        { title: 'Import B', lyrics: 'do re' },
      ])
      expect(imported).toBe(2)
      expect(db.getSongCount()).toBe(2)
    })

    it('skips songs with duplicate titles', () => {
      db.createSong({ title: 'Existing Song' })
      const imported = db.importFavorites([
        { title: 'Existing Song', lyrics: 'dup' },
        { title: 'New Song', lyrics: 'new' },
      ])
      expect(imported).toBe(1)
      expect(db.getSongCount()).toBe(2)
    })

    it('returns 0 for empty array', () => {
      expect(db.importFavorites([])).toBe(0)
    })
  })
})
