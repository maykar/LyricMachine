import { describe, it, expect } from 'vitest'

/**
 * Tests for db.js column-name assertion and field mapping logic.
 *
 * Since db.js creates a real SQLite database on import (side effect),
 * we test the assertion pattern directly rather than importing the module.
 */

// Extracted assertion pattern from db.js updateSong/bulkUpdateField
const COLUMN_RE = /^[a-z_]+$/

// Extracted from db.js
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

describe('db column-name assertion', () => {
  it('accepts all valid column names from FIELD_MAP', () => {
    for (const col of Object.values(FIELD_MAP)) {
      expect(COLUMN_RE.test(col), `"${col}" should be valid`).toBe(true)
    }
  })

  it('rejects SQL injection attempts', () => {
    const attacks = [
      "'; DROP TABLE songs--",
      'title; DELETE FROM songs',
      'col OR 1=1',
      '1; UPDATE songs SET',
      'title = 1; --',
      'col"injection',
      "col'injection",
      'col()',
      'UPPER(title)',
    ]
    for (const attack of attacks) {
      expect(COLUMN_RE.test(attack), `"${attack}" should be rejected`).toBe(false)
    }
  })

  it('rejects uppercase names', () => {
    expect(COLUMN_RE.test('Title')).toBe(false)
    expect(COLUMN_RE.test('PLAYED')).toBe(false)
  })

  it('rejects names with numbers', () => {
    expect(COLUMN_RE.test('col1')).toBe(false)
    expect(COLUMN_RE.test('123')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(COLUMN_RE.test('')).toBe(false)
  })

  it('accepts simple snake_case', () => {
    expect(COLUMN_RE.test('font_adjust')).toBe(true)
    expect(COLUMN_RE.test('not_in_playlist')).toBe(true)
    expect(COLUMN_RE.test('a')).toBe(true)
  })
})

describe('FIELD_MAP coverage', () => {
  it('maps every client key to a valid snake_case column', () => {
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      expect(col).toBeTruthy()
      expect(COLUMN_RE.test(col)).toBe(true)
    }
  })

  it('has no duplicate column values', () => {
    const cols = Object.values(FIELD_MAP)
    expect(new Set(cols).size).toBe(cols.length)
  })
})

describe('BOOL_FIELDS', () => {
  it('all bool fields exist in FIELD_MAP values', () => {
    const cols = new Set(Object.values(FIELD_MAP))
    for (const bf of BOOL_FIELDS) {
      expect(cols.has(bf), `${bf} should be in FIELD_MAP`).toBe(true)
    }
  })
})

describe('JSON_FIELDS', () => {
  it('all JSON fields exist in FIELD_MAP values', () => {
    const cols = new Set(Object.values(FIELD_MAP))
    for (const jf of JSON_FIELDS) {
      expect(cols.has(jf), `${jf} should be in FIELD_MAP`).toBe(true)
    }
  })
})
