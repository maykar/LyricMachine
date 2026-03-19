# LyricMachine — Project Rules

## Stack
- **Frontend:** Vue 3 (`<script setup>`) + Vite 7
- **Backend:** Express 5 (ESM, `server/` directory)
- **Database:** SQLite via Node.js built-in `node:sqlite` (`server/db.js`) — auto-backup on startup (3 copies in `server/data/backups/`)
- **Styling:** Vanilla CSS (`src/style.css`, `src/style-tokens.css`) — no Tailwind, no preprocessors
- **Font:** Inter (Google Fonts)
- **Icons:** `@mdi/js` via `MdiIcon.vue` wrapper component
- **External APIs:** Spotify Web API (Authorization Code flow), lrclib.net (lyrics)

## Architecture
- **Composables-first** — all state/logic lives in `src/composables/use*.js`
- Components are single-file `.vue` with `<script setup>` — no Options API
- Server code in `server/` is pure ESM Node.js (no transpilation)
- Vite dev server uses a custom plugin (`chordApiPlugin`) to mount Express API middleware during development (binds to `127.0.0.1`)
- Production uses `server.js` which serves the built `dist/` folder with the same API routes

## Navigation System
- **Three linear pages**: Dashboard → Library → Lyrics — Escape goes back one page
- **Modal stack**: Settings, Kanban, Randomizer float on any page — Escape closes topmost
- **Ephemeral UI**: Dropdowns and context menus handle Escape locally with `stopImmediatePropagation` (capture phase)
- **One rule**: `dismissTop()` pops topmost modal first, then goes back one page
- All state in `useNavigation.js`, keyboard shortcuts in `useKeyboard.js`

## Patterns
- Favorites = source of truth (SQLite via server API), sync'd from Spotify playlists on mount
- Chord data flows: UG bookmarklet → server parser → poll → server API storage
- Keyboard shortcuts (Space/Escape/R/T/C/P/+/-/arrows) centralized in `useKeyboard.js` + `LyricsDisplay.vue`
- Transitions use JS hooks (Web Animations API), not CSS transitions
- Design tokens defined in `src/style-tokens.css`

## Existing Features (DO NOT suggest these as new features)
### Lyrics Display (`LyricsDisplay.vue`)
- Multi-column layout (auto-selects 2 or 3 columns via binary-search font sizing)
- Multi-page pagination with arrow key navigation
- Line merging (short lines joined with " — ")
- Collapse repeated consecutive lines into "line (x3)" format
- Alternating line colors (warm tint on every other non-empty line)
- Section separators (blank lines → thin horizontal rules)
- Font size +/- controls with manual adjust + auto-calculated base
- Inline lyrics editing (edit button in TopBar, saves to favorites)

### Chords (`ChordDrawer.vue`, `useChords.js`)
- Ultimate Guitar chord import via bookmarklet (server-side HTML parsing)
- Chord editing — add/remove sections, select type from dropdown, edit text
- Transpose — semitone up/down with slash chord support (G/B → G#/C), reset to original
- Capo fret display (from UG import)
- Structure display with abbreviation expansion (IN→INTRO, CH→CHORUS, etc.)
- Per-song chord persistence in favorites (customChords, customStructure)

### Library (`LibraryOverlay.vue`)
- Source playlist sync — user selects Spotify playlist in settings; songs auto-imported with title normalization
- Lyrics auto-fetch from lrclib.net for synced songs
- Album art backfill from Spotify API
- Not-in-playlist tracking — songs removed from Spotify source get flagged with icon + filter, re-addable via context menu
- Search lrclib.net with debounce, inline star/favorite from results
- New song creation form (artist + track + lyrics)
- Drag-and-drop reorder — reorder favorites by dragging cards
- Context menu (`ContextMenu.vue`) — right-click for label change, played toggle, edit play count, clear count, add to source playlist, delete
- Filters — unplayed, no chords, by label (Fresh/Getting There/In Setlist), not in playlist
- Sort — alphabetical, by label, or play count; ascending/descending toggle
- Paginated 4-column card grid with dynamic row count based on viewport
- Word-boundary truncation — card text truncates at clean word boundaries

### Dashboard (`Dashboard.vue`)
- Album art mosaic background
- Recently added songs
- Most played songs
- Label breakdown bar (songs per label)
- Settings gear icon + search icon in top-right

### Spotify Integration (`spotifyAuth.js`, `spotifyPlaylists.js`, `useSpotifyAuth.js`)
- Authorization Code flow — user logs in via Spotify OAuth, tokens stored in SQLite
- Source playlist picker — select which playlist to sync from via settings UI
- Label-based playlists — auto-creates Spotify playlists per label ({bandName} — {Label}), lazy creation
- Bi-directional sync — push local label changes to Spotify, pull Spotify changes to local
- Auto-sync triggers — label change (5s debounce), kanban close (immediate), app startup, kanban open (30s cooldown)
- Podcast filtering — non-track items skipped during sync
- Embedded player — iframe, auto-lookup track ID, track ID caching

### Song Management
- Three labels — Fresh (red), Getting There (yellow), In Setlist (green) — defined in `src/constants/labels.js`
- Play tracking — toggle played status, increment play count, display count
- Per-song settings — font size offset, merge, separators, alt colors (all saved per favorite)
- Kanban board — drag songs between label columns, confetti + party sound; click title for randomized TTS "KANBAN!" (5% chance Easter egg phrase)
- Song randomizer — slot-machine carousel with tick sounds, Spotify preload/autoplay, gold confetti, impact sound, celebrations; Space to spin

### Settings (`SettingsDropdown.vue`, `useSettings.js`)
- Default preferences for new songs (merge, separators, alt colors)
- Apply defaults to all existing favorites
- Clear all chords / Clear all played status
- Spotify connection (login/logout/status)
- Band name configuration
- Source playlist picker
- Manual sync trigger
- UG bookmarklet setup page
- Keyboard shortcuts reference

## Environment Variables (`.env`)
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=...    # optional, defaults to http://127.0.0.1:5555/api/spotify/callback
```
- **Never** hardcode these values — always read from `process.env`
- `.env` is gitignored — see `.env.example` for the template
- Source playlist is selected via UI in settings (no env var needed)

## Coding Style
- No semicolons inconsistency — the codebase mixes semicoloned and unsemicoloned code; follow the style of the file you're editing
- Use `const` by default, `let` when reassignment is needed
- Prefer template literals for string interpolation
- Error handling: catch + log pattern, never crash the server
- API responses: always set appropriate headers and use JSON
- **Tests MUST NEVER import `server/db.js`** — see `security.md` Data Safety rules
- **Tests MUST use `new DatabaseSync(':memory:')` for any database operations** — NEVER the production database

## Tooling Gotcha: ripgrep + .vue files
- **Never** pass a single `.vue` file path directly to `grep_search` — ripgrep's binary detection may find a NUL byte (from Unicode chars like `★✦—`) and silently skip the file
- When searching a directory, ripgrep uses its type system and correctly treats `.vue` as text; when given a direct file path, it falls back to content-sniffing and may misclassify
- **Always** search the parent directory with `Includes: ["*.vue"]` instead, or use PowerShell `Select-String` as a fallback

## File Naming
- Components: PascalCase (e.g., `LibraryOverlay.vue`)
- Composables: camelCase with `use` prefix (e.g., `useFavorites.js`)
- Server modules: camelCase (e.g., `chordParser.js`)
