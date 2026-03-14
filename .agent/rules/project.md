# LyricMachine — Project Rules

## Stack
- **Frontend:** Vue 3 (`<script setup>`) + Vite 7
- **Backend:** Express 5 (ESM, `server/` directory)
- **Styling:** Vanilla CSS (`src/style.css`) — no Tailwind, no preprocessors
- **Font:** Inter (Google Fonts)
- **Icons:** `@mdi/js` via `MdiIcon.vue` wrapper component
- **State:** localStorage (`lyricmachine_favorites`, `lyricmachine_defaults`)
- **External APIs:** Spotify Web API (client credentials flow), lrclib.net (lyrics)

## Architecture
- **Composables-first** — all state/logic lives in `src/composables/use*.js`
- Components are single-file `.vue` with `<script setup>` — no Options API
- Server code in `server/` is pure ESM Node.js (no transpilation)
- Vite dev server uses a custom plugin (`chordApiPlugin`) to mount Express API middleware during development
- Production uses `server.js` which serves the built `dist/` folder with the same API routes

## Patterns
- Favorites = source of truth (localStorage), sync'd from Spotify playlists on mount
- Chord data flows: UG bookmarklet → server parser → poll → favorites storage
- Keyboard shortcuts (Space, T, C, P, M, L, H, +/-, arrows, Escape) are centralized in `useKeyboard.js` + `LyricsDisplay.vue`
- Transitions use JS hooks (Web Animations API), not CSS transitions

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

### Library (`LibraryOverlay.vue`, `FavoritesOverlay.vue`)
- Spotify playlist sync on startup with title normalization for dedup
- Lyrics auto-fetch from lrclib.net for synced songs
- Album art backfill from Spotify API
- Search lrclib.net with debounce, inline star/favorite from results
- **Export/Import** — download favorites as JSON, import with merge (dedup by title) — exists in BOTH LibraryOverlay and FavoritesOverlay
- New song creation form (artist + track + lyrics)
- **Drag-and-drop reorder** — reorder favorites by dragging cards
- Context menu — right-click for label change, played toggle, edit play count, delete
- Filters — unplayed, no chords, by label (Fresh/Getting There/In Setlist)
- Sort — by label or play count, ascending/descending toggle
- Paginated 3-column card grid with dynamic row count based on viewport

### Song Management
- Three labels — Fresh (red), Getting There (yellow), In Setlist (green)
- Play tracking — toggle played status, increment play count, display count
- Per-song settings — font size offset, merge, separators, alt colors (all saved per favorite)
- Kanban board — drag songs between label columns, confetti + party sound + "KANBAN!" speech
- Song randomizer — slot-machine carousel with tick sounds, Spotify preload/autoplay, gold confetti, impact sound, light rays, fireworks, glow stars

### Playback
- Spotify player — embedded iframe, auto-lookup track ID
- Spotify track ID caching in favorites
- Randomizer pre-loads Spotify and triggers autoplay on landing

### Settings (`SettingsDropdown.vue`, `useSettings.js`)
- Default preferences for new songs (merge, separators, alt colors)
- Apply defaults to all existing favorites
- Clear all chords
- Clear all played status
- UG bookmarklet setup page
- Keyboard shortcuts reference

## Environment Variables (`.env`)
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_PLAYLIST_ID=...
```
- **Never** hardcode these values — always read from `process.env`
- `.env` is gitignored — see `.env.example` for the template

## Coding Style
- No semicolons inconsistency — the codebase mixes semicoloned and unsemicoloned code; follow the style of the file you're editing
- Use `const` by default, `let` when reassignment is needed
- Prefer template literals for string interpolation
- Error handling: catch + log pattern, never crash the server
- API responses: always set appropriate headers and use JSON

## Tooling Gotcha: ripgrep + .vue files
- **Never** pass a single `.vue` file path directly to `grep_search` — ripgrep's binary detection may find a NUL byte (from Unicode chars like `★✦—`) and silently skip the file
- When searching a directory, ripgrep uses its type system and correctly treats `.vue` as text; when given a direct file path, it falls back to content-sniffing and may misclassify
- **Always** search the parent directory with `Includes: ["*.vue"]` instead, or use PowerShell `Select-String` as a fallback

## File Naming
- Components: PascalCase (e.g., `LibraryOverlay.vue`)
- Composables: camelCase with `use` prefix (e.g., `useFavorites.js`)
- Server modules: camelCase (e.g., `chordParser.js`)
