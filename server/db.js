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

    // Special handling for 002: table recreation to drop UNIQUE constraint
    if (num === 2) {
      try {
        const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='songs'").get()
        if (tableInfo && tableInfo.sql.includes('UNIQUE')) {
          db.exec('BEGIN')
          try {
            // Recreate table without UNIQUE on title
            const cols = db.prepare('PRAGMA table_info(songs)').all()
            const colDefs = cols.map(c => {
              let def = `${c.name} ${c.type || 'TEXT'}`
              if (c.pk) def += ' PRIMARY KEY AUTOINCREMENT'
              if (c.notnull && !c.pk) def += ' NOT NULL'
              if (c.dflt_value !== null && !c.pk) def += ` DEFAULT ${c.dflt_value}`
              return def
            }).join(',\n        ')

            db.exec(`CREATE TABLE songs_new (${colDefs})`)
            db.exec(`INSERT INTO songs_new SELECT * FROM songs`)
            db.exec(`DROP TABLE songs`)
            db.exec(`ALTER TABLE songs_new RENAME TO songs`)
            db.exec('COMMIT')
            console.log('Migration 002: UNIQUE constraint removed from title')
          } catch (err) {
            db.exec('ROLLBACK')
            console.error('Migration 002 table recreation failed:', err.message)
            continue
          }
        }
      } catch { /* fresh install, no UNIQUE to remove */ }
    }

    // Run the SQL file — strip comments and execute the whole batch
    try {
      const raw = readFileSync(join(migrationsDir, file), 'utf8')
      const sql = raw.replace(/--.*$/gm, '').trim()
      if (sql) {
        try { db.exec(sql) } catch { /* IF NOT EXISTS / IF EXISTS guards handle duplicates */ }
      }
      // Update schema version
      db.exec(`INSERT INTO settings (key, value) VALUES ('schema_version', '${num}') ON CONFLICT(key) DO UPDATE SET value = '${num}'`)
      console.log(`Migration ${file} complete`)
    } catch (err) {
      console.error(`Migration ${file} failed:`, err.message)
    }
  }
}

runMigrations()

// --- Prepared statements ---
const stmts = {
  allSongs:     db.prepare('SELECT * FROM songs ORDER BY sort_order ASC, id ASC'),
  songById:     db.prepare('SELECT * FROM songs WHERE id = ?'),
  songByTitle:  db.prepare('SELECT * FROM songs WHERE title = ?'),
  songByTitleAndTrackId: db.prepare('SELECT * FROM songs WHERE title = ? AND COALESCE(spotify_track_id, \'\') = COALESCE(?, \'\')'),
  songCount:    db.prepare('SELECT COUNT(*) AS count FROM songs'),

  insertSong:   db.prepare(`
    INSERT INTO songs (title, lyrics, font_adjust, merge, separators, alt_colors,
      label, played, play_count, custom_chords, custom_structure,
      spotify_track_id, album_art, capo, not_in_playlist, sort_order)
    VALUES (@title, @lyrics, @font_adjust, @merge, @separators, @alt_colors,
      @label, @played, @play_count, @custom_chords, @custom_structure,
      @spotify_track_id, @album_art, @capo, @not_in_playlist, @sort_order)
  `),

  updateSong:  null,  // built dynamically per-request (partial updates)

  deleteSong:   db.prepare('DELETE FROM songs WHERE id = ?'),

  getSetting:   db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting:   db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
}

// --- Helpers: convert between DB rows (snake_case) and client objects (camelCase) ---

/** DB row → client-friendly object */
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

/** Client object → DB params (for INSERT) */
function songToParams(song, sortOrder = 0) {
  return {
    title: song.title,
    lyrics: song.lyrics || '',
    font_adjust: song.fontAdjust || 0,
    merge: song.merge ? 1 : 0,
    separators: song.separators ? 1 : 0,
    alt_colors: song.altColors !== false ? 1 : 0,
    label: song.label || 'fresh',
    played: song.played ? 1 : 0,
    play_count: song.playCount || 0,
    custom_chords: song.customChords ? JSON.stringify(song.customChords) : null,
    custom_structure: song.customStructure || '',
    spotify_track_id: song.spotifyTrackId || null,
    album_art: song.albumArt || null,
    capo: song.capo ?? null,
    not_in_playlist: song.notInPlaylist ? 1 : 0,
    sort_order: sortOrder,
  }
}

// camelCase field → snake_case column mapping
const FIELD_MAP = {
  title: 'title', lyrics: 'lyrics', fontAdjust: 'font_adjust',
  merge: 'merge', separators: 'separators', altColors: 'alt_colors',
  label: 'label', played: 'played', playCount: 'play_count',
  customChords: 'custom_chords', customStructure: 'custom_structure',
  spotifyTrackId: 'spotify_track_id', albumArt: 'album_art',
  capo: 'capo', notInPlaylist: 'not_in_playlist', sortOrder: 'sort_order',
}

// Fields that are booleans in client but INTEGER 0/1 in DB
const BOOL_FIELDS = new Set(['merge', 'separators', 'alt_colors', 'played', 'not_in_playlist'])

// Fields that are JSON in client but TEXT in DB
const JSON_FIELDS = new Set(['custom_chords'])

// --- Public API ---

export function getAllSongs() {
  return stmts.allSongs.all().map(rowToSong)
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
      values.push(value ? JSON.stringify(value) : null)
    } else {
      values.push(value ?? null)
    }
  }

  if (setClauses.length === 0) return getSong(id)

  setClauses.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE songs SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)
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
