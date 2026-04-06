import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, copyFileSync, readdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const BACKUP_DIR = join(DATA_DIR, 'backups')
const DB_PATH = join(DATA_DIR, 'lyricmachine.db')
const MAX_BACKUPS = 3

// Ensure data + backup directories exist
mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(BACKUP_DIR, { recursive: true })

// --- Auto-backup on startup ---
if (existsSync(DB_PATH)) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(BACKUP_DIR, `lyricmachine-${ts}.db`)
    copyFileSync(DB_PATH, backupPath)

    // Rotate: keep only the newest MAX_BACKUPS
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('lyricmachine-') && f.endsWith('.db'))
      .sort()
    while (files.length > MAX_BACKUPS) {
      unlinkSync(join(BACKUP_DIR, files.shift()))
    }
    console.log(`DB backup: ${backupPath}`)
  } catch (err) {
    console.warn('DB backup failed:', err.message)
  }
}

const db = new DatabaseSync(DB_PATH)

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    lyrics          TEXT DEFAULT '',
    font_adjust     INTEGER DEFAULT 0,
    merge           INTEGER DEFAULT 0,
    separators      INTEGER DEFAULT 0,
    alt_colors      INTEGER DEFAULT 0,
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
    merge_aggressive INTEGER DEFAULT 0,
    collapse_chorus  INTEGER DEFAULT 0,
    show_chords      INTEGER,
    synced_lyrics    TEXT,
    lyric_view       TEXT DEFAULT 'standard',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  )
`)
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_title_trackid ON songs(title, COALESCE(spotify_track_id, ''))`)
} catch { /* expression index may not be supported on all SQLite builds */ }
// Settings table (must exist before migrations, which use it for schema_version)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

// --- Migrations ---
// Numbered SQL files in server/migrations/ run automatically on startup.
// schema_version setting tracks the last applied migration number.

function getSchemaVersion() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('schema_version')
    return row ? parseInt(row.value, 10) : 0
  } catch {
    return 0  // settings table might not exist yet
  }
}

function runMigrations() {
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
  if (!existsSync(migrationsDir)) return

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const currentVersion = getSchemaVersion()

  for (const file of files) {
    const num = parseInt(file.split('_')[0], 10)
    if (isNaN(num) || num <= currentVersion) continue

    console.log(`Running migration ${file}...`)

    // Run the SQL file — strip comments and execute each statement
    try {
      const raw = readFileSync(join(migrationsDir, file), 'utf8')
      const sql = raw.replace(/--.*$/gm, '').trim()
      if (sql) {
        // Execute each statement separately (ALTER TABLE doesn't support multi-statement).
        // Only swallow "already exists" / "duplicate column" errors — those are expected
        // from IF NOT EXISTS guards. Any other error is a real migration failure; rethrow
        // so schema_version is NOT advanced and the migration can be retried on next start.
        for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
          try {
            db.exec(stmt)
          } catch (stmtErr) {
            const msg = stmtErr.message || ''
            const isBenign = /already exists|duplicate column/i.test(msg)
            if (!isBenign) throw stmtErr
          }
        }
      }
      // Only update schema version if every statement succeeded (or was benign)
      db.exec(`INSERT INTO settings (key, value) VALUES ('schema_version', '${num}') ON CONFLICT(key) DO UPDATE SET value = '${num}'`)
      console.log(`Migration ${file} complete`)
    } catch (err) {
      console.error(`Migration ${file} FAILED — schema_version NOT advanced:`, err.message)
      // Stop here: subsequent migrations may depend on this one succeeding
      break
    }
  }
}

runMigrations()

// --- One-time JS data repairs (things SQL can't do) ---

function repairCorruptedChords() {
  const flag = 'repair_chord_tokens_v2'
  const done = db.prepare('SELECT value FROM settings WHERE key = ?').get(flag)
  if (done) return

  const CHORD_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus\d?|add\d+|7|9|11|13|6)*(\/[A-G][#b]?)?$/

  // Try to extract the longest valid chord prefix from a corrupted token
  function fixToken(tok) {
    if (CHORD_RE.test(tok)) return tok
    // Trim characters from the end until it matches or is too short
    for (let len = tok.length - 1; len >= 1; len--) {
      const candidate = tok.slice(0, len)
      if (CHORD_RE.test(candidate)) return candidate
    }
    return tok // give up, keep as-is
  }

  const rows = db.prepare('SELECT id, custom_chords FROM songs WHERE custom_chords IS NOT NULL').all()
  let fixed = 0

  for (const row of rows) {
    let sections
    try { sections = JSON.parse(row.custom_chords) } catch { continue }
    if (!Array.isArray(sections)) continue

    let changed = false
    for (const section of sections) {
      if (!section.chords || typeof section.chords !== 'string') continue
      const tokens = section.chords.split(' · ')
      const repaired = tokens.map(t => {
        const f = fixToken(t)
        if (f !== t) changed = true
        return f
      })
      if (changed) section.chords = repaired.join(' · ')
    }

    if (changed) {
      db.prepare('UPDATE songs SET custom_chords = ? WHERE id = ?').run(JSON.stringify(sections), row.id)
      fixed++
    }
  }

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(flag, '1')
  if (fixed > 0) console.log(`Repaired chord tokens in ${fixed} song(s)`)
}

repairCorruptedChords()

// --- Prepared statements ---
const stmts = {
  allSongs:     db.prepare('SELECT * FROM songs ORDER BY sort_order ASC, id ASC'),
  songById:     db.prepare('SELECT * FROM songs WHERE id = ?'),
  songByTitle:  db.prepare('SELECT * FROM songs WHERE title = ?'),
  songByTitleAndTrackId: db.prepare('SELECT * FROM songs WHERE title = ? AND COALESCE(spotify_track_id, \'\') = COALESCE(?, \'\')'),
  songCount:    db.prepare('SELECT COUNT(*) AS count FROM songs'),
  summarySongs: db.prepare("SELECT id, title, font_adjust, merge, separators, alt_colors, label, played, play_count, custom_structure, spotify_track_id, album_art, capo, transpose, custom_labels, not_in_playlist, sort_order, merge_aggressive, collapse_chorus, lyric_view, CASE WHEN lyrics IS NOT NULL AND lyrics != '' THEN 1 ELSE 0 END as has_lyrics, CASE WHEN custom_chords IS NOT NULL AND custom_chords != '[]' THEN 1 ELSE 0 END as has_chords, CASE WHEN synced_lyrics IS NOT NULL AND synced_lyrics != '' THEN 1 ELSE 0 END as has_synced FROM songs ORDER BY sort_order ASC, id ASC"),

  insertSong:   db.prepare(`
    INSERT INTO songs (title, lyrics, font_adjust, merge, separators, alt_colors,
      label, played, play_count, custom_chords, custom_structure,
      spotify_track_id, album_art, capo, transpose, custom_labels,
      not_in_playlist, sort_order, merge_aggressive, collapse_chorus,
      synced_lyrics, lyric_view)
    VALUES (@title, @lyrics, @font_adjust, @merge, @separators, @alt_colors,
      @label, @played, @play_count, @custom_chords, @custom_structure,
      @spotify_track_id, @album_art, @capo, @transpose, @custom_labels,
      @not_in_playlist, @sort_order, @merge_aggressive, @collapse_chorus,
      @synced_lyrics, @lyric_view)
  `),

  updateSong:  null,  // built dynamically per-request (partial updates)

  deleteSong:   db.prepare('DELETE FROM songs WHERE id = ?'),

  getSetting:   db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting:   db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
}

// --- Single schema declaration — one source of truth for all field mappings ---
//
// type: 'str' | 'int' | 'bool' | 'json'
// default: value returned when DB column is NULL (undefined = field omitted from summary)
// summaryOnly: if true, field only appears in rowToSongSummary (computed, not a real column)

const SCHEMA = [
  { key: 'title',           col: 'title',             type: 'str'  },
  { key: 'lyrics',          col: 'lyrics',             type: 'str',  default: '' },
  { key: 'fontAdjust',      col: 'font_adjust',        type: 'int',  default: 0 },
  { key: 'merge',           col: 'merge',              type: 'bool', default: false },
  { key: 'separators',      col: 'separators',         type: 'bool', default: false },
  { key: 'altColors',       col: 'alt_colors',         type: 'bool', default: true },
  { key: 'label',           col: 'label',              type: 'str',  default: 'fresh' },
  { key: 'played',          col: 'played',             type: 'bool', default: false },
  { key: 'playCount',       col: 'play_count',         type: 'int',  default: 0 },
  { key: 'customChords',    col: 'custom_chords',      type: 'json' },
  { key: 'customStructure', col: 'custom_structure',   type: 'str',  default: '' },
  { key: 'spotifyTrackId',  col: 'spotify_track_id',   type: 'str' },
  { key: 'albumArt',        col: 'album_art',          type: 'str' },
  { key: 'capo',            col: 'capo',               type: 'int' },
  { key: 'transpose',       col: 'transpose',          type: 'int',  default: 0 },
  { key: 'customLabels',    col: 'custom_labels',      type: 'json', default: [] },
  { key: 'notInPlaylist',   col: 'not_in_playlist',    type: 'bool', default: false },
  { key: 'sortOrder',       col: 'sort_order',         type: 'int',  default: 0 },
  { key: 'mergeAggressive', col: 'merge_aggressive',   type: 'bool', default: false },
  { key: 'collapseChorus',  col: 'collapse_chorus',    type: 'bool', default: false },
  { key: 'showChords',      col: 'show_chords',        type: 'bool' },
  { key: 'syncedLyrics',    col: 'synced_lyrics',       type: 'str' },
  { key: 'lyricView',       col: 'lyric_view',          type: 'str',  default: 'standard' },
]

// Derived lookups — computed once from SCHEMA
const FIELD_MAP = Object.fromEntries(SCHEMA.map(f => [f.key, f.col]))
const BOOL_FIELDS = new Set(SCHEMA.filter(f => f.type === 'bool').map(f => f.col))
const JSON_FIELDS = new Set(SCHEMA.filter(f => f.type === 'json').map(f => f.col))

// --- Helpers: convert between DB rows (snake_case) and client objects (camelCase) ---

/** Decode a single DB column value based on its schema type */
function decodeCol(field, colValue) {
  if (field.type === 'bool') {
    if (colValue == null) return field.default ?? undefined
    return !!colValue
  }
  if (field.type === 'json') {
    if (colValue == null || colValue === '') return field.default ?? undefined
    try { return JSON.parse(colValue) } catch { return field.default ?? undefined }
  }
  if (colValue == null) return field.default ?? undefined
  if (field.type === 'int')   return colValue
  return colValue  // str
}

/** Encode a client-side value for DB storage */
function encodeCol(field, value) {
  if (field.type === 'bool') return value == null ? null : (value ? 1 : 0)
  if (field.type === 'json') return value != null ? JSON.stringify(value) : null
  return value ?? null
}

/** DB row → full client-friendly object (includes lyrics + raw hasLyrics/hasChords) */
function rowToSong(row) {
  if (!row) return null
  const obj = { id: row.id }
  for (const field of SCHEMA) {
    obj[field.key] = decodeCol(field, row[field.col])
  }
  obj.hasLyrics = !!(row.lyrics)
  obj.hasChords = !!(row.custom_chords) && row.custom_chords !== '[]'
  return obj
}

/** DB row (from summarySongs) → client-friendly object (no lyrics, has computed has_* cols) */
function rowToSongSummary(row) {
  if (!row) return null
  const obj = { id: row.id }
  for (const field of SCHEMA) {
    if (field.key === 'lyrics' || field.key === 'syncedLyrics') continue  // not fetched in summary query
    obj[field.key] = decodeCol(field, row[field.col])
  }
  obj.hasLyrics = !!row.has_lyrics
  obj.hasChords = !!row.has_chords
  obj.hasSynced = !!row.has_synced
  return obj
}

/** Client object → DB params (for INSERT) */
function songToParams(song, sortOrder = 0) {
  const params = {}
  for (const field of SCHEMA) {
    if (field.key === 'title' || field.key === 'sortOrder') continue  // handled separately
    params[field.col] = encodeCol(field, song[field.key])
  }
  params.title = song.title
  params.sort_order = sortOrder
  return params
}

// --- Public API ---

export function getAllSongs() {
  return stmts.allSongs.all().map(rowToSong)
}

export function getSongsSummary() {
  return stmts.summarySongs.all().map(rowToSongSummary)
}

export function getSong(id) {
  return rowToSong(stmts.songById.get(id))
}

export function getSongByTitle(title) {
  return rowToSong(stmts.songByTitle.get(title))
}

export function getSongCount() {
  return stmts.songCount.get().count
}

/** Lightweight fetch for sync lookups — only columns needed to match against a playlist. */
export function getAllSongTitlesAndTrackIds() {
  return db.prepare('SELECT id, title, spotify_track_id, not_in_playlist FROM songs').all().map(row => ({
    id: row.id,
    title: row.title,
    spotifyTrackId: row.spotify_track_id,
    notInPlaylist: !!row.not_in_playlist,
  }))
}

export function createSong(song) {
  // Use max sort_order + 1 for new songs (append to end)
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM songs').get().m
  const params = songToParams(song, maxOrder + 1)
  const result = stmts.insertSong.run(params)
  return getSong(result.lastInsertRowid)
}

export function upsertSong(song) {
  // Match by (title, spotify_track_id) to allow different songs with the same title
  const existing = stmts.songByTitleAndTrackId.get(song.title, song.spotifyTrackId || null)
  if (existing) {
    updateSong(existing.id, song)
    return getSong(existing.id)
  }
  // Fallback: also check by title-only for songs without track IDs (manual creation)
  if (!song.spotifyTrackId) {
    const byTitle = stmts.songByTitle.get(song.title)
    if (byTitle) {
      updateSong(byTitle.id, song)
      return getSong(byTitle.id)
    }
  }
  return createSong(song)
}

// --- Prepared statement cache for partial updates ---
const _updateStmtCache = new Map()

export function updateSong(id, fields) {
  const setClauses = []
  const values = []

  for (const [clientKey, value] of Object.entries(fields)) {
    const col = FIELD_MAP[clientKey]
    if (!col || clientKey === 'id') continue
    // Safety: assert column name is purely alphanumeric+underscore
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

  if (setClauses.length === 0) return getSong(id)

  setClauses.push("updated_at = datetime('now')")
  values.push(id)

  // Cache prepared statements by column combination to prevent memory leak
  const cacheKey = setClauses.slice(0, -1).join(',')  // exclude updated_at (always present)
  let stmt = _updateStmtCache.get(cacheKey)
  if (!stmt) {
    stmt = db.prepare(`UPDATE songs SET ${setClauses.join(', ')} WHERE id = ?`)
    _updateStmtCache.set(cacheKey, stmt)
  }
  stmt.run(...values)
  return getSong(id)
}

export function deleteSong(id) {
  return stmts.deleteSong.run(id)
}

export function reorderSongs(songIds) {
  const update = db.prepare('UPDATE songs SET sort_order = ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    for (let i = 0; i < songIds.length; i++) {
      update.run(i, songIds[i])
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function bulkUpdateField(field, value) {
  const col = FIELD_MAP[field]
  if (!col) return { ok: false, error: `Unknown field: ${field}` }
  // Safety: assert column name is purely alphanumeric+underscore
  if (!/^[a-z_]+$/.test(col)) throw new Error(`Invalid column name: ${col}`)
  const dbVal = BOOL_FIELDS.has(col) ? (value ? 1 : 0) : value
  db.prepare(`UPDATE songs SET ${col} = ?, updated_at = datetime('now') WHERE 1=1`).run(dbVal)
  return { ok: true }
}

export function clearAllChords() {
  db.prepare("UPDATE songs SET custom_chords = NULL, custom_structure = '', updated_at = datetime('now') WHERE custom_chords IS NOT NULL").run()
}

export function getSetting(key) {
  const row = stmts.getSetting.get(key)
  return row ? JSON.parse(row.value) : null
}

export function setSetting(key, value) {
  stmts.setSetting.run(key, JSON.stringify(value))
}

/** Import an array of favorites from localStorage (one-time migration) */
export function importFavorites(favs) {
  let imported = 0
  for (let i = 0; i < favs.length; i++) {
    // Match by (title, spotify_track_id) to allow different songs with same title
    const existing = stmts.songByTitleAndTrackId.get(
      favs[i].title, favs[i].spotifyTrackId || null
    )
    if (existing) continue
    const params = songToParams(favs[i], i)
    stmts.insertSong.run(params)
    imported++
  }
  return imported
}
