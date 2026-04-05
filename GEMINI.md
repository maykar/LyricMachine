# LyricMachine

> Live lyrics display and song management for band jams.

## What is this?

LyricMachine helps musicians display song lyrics, chords, and Spotify playback during live jam sessions. It syncs with a Spotify playlist, auto-fetches lyrics from lrclib.net, and lets you import chord charts from Ultimate Guitar via a browser bookmarklet.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3 (`<script setup>`) + Vite 7 |
| Backend | Express 5 (ESM Node.js) |
| Database | SQLite (via Node.js built-in `node:sqlite`) |
| Styling | Vanilla CSS, Inter font, responsive rem scaling (`font-size: calc(100vw / 120)`) |
| Icons | `@mdi/js` |
| APIs | Spotify Web API (Authorization Code flow), lrclib.net, Ultimate Guitar (via bookmarklet) |

## Project Structure

```
├── index.html              # SPA entry point
├── server.js               # Production Express server
├── vite.config.js           # Vite config + API plugin (dev server binds 127.0.0.1)
├── shared/
│   └── normalize.js         # Title normalization (shared between client + server)
├── server/
│   ├── api.js               # Route registry + .env loader + parseBody helper (10MB limit)
│   ├── db.js                # SQLite database (songs, settings tables) — column-name assertion on writes
│   ├── utils.js             # spotifyFetch with retry + throw-on-exhaustion, re-exports shared/normalize
│   ├── spotify.js           # Spotify client-credentials search + playlist sync
│   ├── spotifyAuth.js       # Spotify Authorization Code flow (login, callback, token refresh)
│   ├── spotifyPlaylists.js  # Source playlist sync engine + mutex guard + parallel lyrics fetch
│   ├── chordParser.js       # HTML→chord parser (from UG pre.innerHTML)
│   ├── ugImport.js          # Import/poll endpoints + bookmarklet page
│   ├── bookmarklet.js       # Browser bookmarklet code
│   ├── popularArt.js        # Dashboard album art mosaic helper (genres configurable via settings)
│   ├── crypto.js            # AES-256-GCM encrypt/decrypt for Spotify tokens, auto-generates key
│   ├── authMiddleware.js    # API token auth + CSRF origin check middleware, auto-generates token
│   ├── validation.js        # Valibot input validation schemas for API routes
│   └── migrations/          # Numbered SQL migration files (run automatically on startup)
├── src/
│   ├── App.vue              # Root component — wires all features together
│   ├── api.js               # Centralized API client — wraps every server endpoint, errors → console + toast
│   ├── main.js              # Vue app bootstrap
│   ├── style.css            # Global styles
│   ├── style-tokens.css     # Design tokens (colors, spacing, radii, etc.)
│   ├── constants/
│   │   └── labels.js        # Kanban label definitions (Ignored/Fresh/Getting There/In Setlist)
│   ├── utils/
│   │   ├── normalize.js     # Re-exports shared/normalize.js
│   │   ├── titleParser.js   # Title normalization + "Artist — Track" splitting
│   │   └── adjustDropdown.js# Smart dropdown/popup repositioning — keeps menus inside viewport
│   ├── components/
│   │   ├── TopBar.vue       # Header: font controls, edit, search, played, label, star, page indicator (lyrics page only)
│   │   ├── LyricsDisplay.vue# DOM-based lyrics renderer — Pretext arithmetic layout, binary-search font sizing (zero DOM reflows), multi-column, pagination, merge, collapse repeats, alt colors, separators, rAF-driven resize + font lerp
│   │   ├── LibraryOverlay.vue# Library page: search lrclib, favorites grid (3–4 cols), drag-and-drop reorder, context menu, filters, sort, new song form
│   │   ├── Dashboard.vue    # Home page: album art mosaic, recently added, most played (dynamic height), label breakdown bar, context menu
│   │   ├── KanbanView.vue   # Kanban board modal for song categorization with drag-and-drop, context menu, settings cog, confetti, party sound
│   │   ├── SongRandomizer.vue# Slot-machine random song picker modal with carousel animation, celebrations, winner context menu
│   │   ├── ChordDrawer.vue  # Collapsible chord chart footer with transpose, edit mode, capo display
│   │   ├── SettingsDropdown.vue# Settings modal: defaults, Spotify connection, band name, mosaic genres, source playlist, sync, backup/restore
│   │   ├── SpotifyPlayer.vue# Embedded Spotify player via iframe, interaction-guarded pause
│   │   ├── ContextMenu.vue  # Right-click context menu (label/played/delete/add-to-source) — smart viewport repositioning
│   │   ├── NewSongForm.vue  # Manual song creation form (artist + track + lyrics)
│   │   ├── SearchOverlay.vue# Quick single-result song search via lrclib
│   │   ├── ToastContainer.vue# Stacked toast notifications at bottom-right with slide-in animation
│   │   ├── StarButton.vue   # Star/unsave toggle
│   │   └── MdiIcon.vue      # SVG icon wrapper (rem-scaled)
│   └── composables/
│       ├── useNavigation.js # Unified navigation: 3 pages (dashboard/library/lyrics) + modal stack (settings/kanban/randomizer)
│       ├── useKeyboard.js   # Global keyboard shortcuts — Escape calls dismissTop(), shortcuts blocked when modal open
│       ├── useFavorites.js  # Singleton store: favorites CRUD via api.js, per-song settings, label management, play tracking
│       ├── useSettings.js   # User defaults persistence via api.js, apply-to-all, clear-all-chords
│       ├── useChords.js     # Chord fetching from saved data, Spotify track ID lookup + cache, chord editing + reset
│       ├── useUGImport.js   # UG bookmarklet import polling (2s interval, 2min timeout)
│       ├── usePlaylistSync.js# Spotify playlist sync with title normalization, lyrics auto-fetch from lrclib, album art backfill
│       ├── useSpotifyAuth.js# Client-side Spotify connection state (connected/user/status) via api.js
│       ├── useSpotifyEmbed.js# IFrame Embed API fallback — 30s preview playback for non-Premium users (warmUp/preload/play/pause/destroy)
│       └── useToast.js      # Singleton toast notifications — showToast(message, {type, duration}), auto-dismiss
├── tests/
│   ├── shared/              # normalize, titleParser
│   ├── server/              # db assertions, spotifyFetch, parseBody, chordParser, crypto, authMiddleware
│   ├── client/              # api client, useToast, useFavorites, useSettings
│   └── components/          # LyricsDisplay algorithms
└── public/
    ├── SloshRat.png         # Mascot image
    ├── party.ogg            # Kanban celebration sound
    └── special.ogg          # Randomizer impact sound
```

## Setup

```bash
npm install
cp .env.example .env        # Fill in your Spotify credentials
npm run dev                  # Vite dev server on http://127.0.0.1:5555
npm test                     # Run test suite
```

## Environment Variables

See `.env.example` for required variables. Never commit `.env`.

Required: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`

Auto-generated (do not commit):
- `ENCRYPTION_KEY` — AES-256 key for Spotify token storage. Generated on first Spotify login. Losing it invalidates stored tokens.
- `API_TOKEN` — Bearer token for API authentication. Generated on first server startup.

Source playlist is selected via UI in settings (no env var needed).

## Navigation System

Three linear pages with a modal stack on top:

```
Dashboard (1)  ←→  Library (2)  ←→  Lyrics (3)
```

- **Pages**: Escape goes back one page (lyrics→library→dashboard)
- **Modals** (settings, kanban, randomizer): float on any page, Escape closes topmost
- **Ephemeral UI** (dropdowns, context menus): component-level Escape with stopPropagation
- **Rule**: `dismissTop()` closes topmost modal first, then goes back one page

All state lives in `useNavigation.js`. Keyboard shortcuts in `useKeyboard.js`.

## Auth & Security

- **API token auth** — `authMiddleware.js` validates Bearer token on all `/api/` routes
- **Auto-generated token** — `API_TOKEN` created on first startup, persisted to `.env`
- **Token bootstrap** — client fetches token via unauthenticated `GET /api/auth/token`
- **CSRF origin check** — non-GET requests from foreign origins are rejected
- **SKIP_AUTH endpoints** — `/api/spotify/login`, `/api/spotify/callback`, `/api/auth/token`, `/api/import-raw`, `/api/bookmarklet`, `/api/bookmarklet.js` bypass auth (bookmarklet POSTs from external origin)
- **Stale token retry** — api client retries once on 401 after clearing cached token (handles server restarts)

## Input Validation

- **Valibot schemas** — `server/validation.js` validates all API input with typed schemas
- **Label values** — `ignored`, `fresh`, `getting-there`, `in-setlist` (hyphens, not underscores)
- **BoolInt fields** — accepts both `true`/`false` and `0`/`1` for played, merge, separators, altColors, notInPlaylist
- **customChords** — accepts string (legacy), array of section objects, or null

## Key Features

### Lyrics
- **Multi-column display** — auto-fits lyrics into 2 or 3 columns with binary-search font sizing
- **Multi-page pagination** — splits long songs across pages; arrow keys to navigate
- **Line merging** — short consecutive lines joined with " — " when they fit
- **Collapse repeats** — "line\nline\nline" becomes "line (x3)"
- **Alternating colors** — every other non-empty line gets a warm tint
- **Section separators** — blank lines rendered as thin horizontal rules
- **Inline editing** — edit lyrics directly and save back to favorites
- **Font size controls** — +/- buttons and keyboard shortcuts

### Chords
- **UG chord import** — bookmarklet extracts chord charts from Ultimate Guitar, server parses HTML→sections
- **Chord editing** — add/remove sections, select section type from dropdown, edit chord text
- **Transpose** — semitone up/down with slash chord support (G/B → G#/C), reset to original
- **Capo display** — shows capo fret when detected from UG import
- **Structure display** — abbreviations auto-expanded (IN→INTRO, CH→CHORUS, etc.)

### Library
- **Source playlist sync** — user selects a Spotify playlist in settings; songs auto-imported with title normalization
- **Lyrics auto-fetch** — fetches plain lyrics from lrclib.net for synced songs
- **Album art backfill** — fetches album art from Spotify API for songs missing it
- **Not-in-playlist tracking** — songs removed from source playlist get flagged (icon + filter), can be re-added via context menu
- **Search** — search lrclib.net with debounce, inline star/favorite from results
- **New song creation** — manual artist + track + lyrics form
- **Drag-and-drop reorder** — reorder favorites by dragging cards
- **Context menu** — right-click for label change, played toggle, edit play count, clear count, add to source playlist, delete
- **Filters** — unplayed, no chords, by label, not in playlist
- **Sort** — alphabetical, by label, or play count; ascending/descending toggle
- **Paginated grid** — 3–4 column card grid with dynamic row count based on viewport height
- **Dynamic columns** — uses 3 columns if all items fit in one page, else 4
- **Word-boundary truncation** — card text truncates at clean word boundaries

### Spotify Integration
- **Authorization Code flow** — user logs in via Spotify OAuth, tokens stored in SQLite
- **Source playlist picker** — select which playlist to sync from via settings UI
- **Source playlist sync** — imports songs from selected Spotify playlist, marks removed tracks
- **Add to source** — re-add songs to source playlist via context menu
- **Podcast filtering** — non-track items skipped during sync
- **Embedded player** — iframe player with auto-lookup track ID, track ID caching, interaction-guarded pause (only sends toggle if user clicked play)
- **Web Playback SDK** — global player in App.vue for programmatic full-track playback (requires Premium + HTTPS)
- **IFrame Embed fallback** — `useSpotifyEmbed.js` provides 30-second preview playback for non-Premium users via hidden IFrame API controller
- **Dual playback strategy** — randomizer checks for SDK device ID; if present uses SDK (full track), otherwise falls back to IFrame embed (30s preview)

### API Client Architecture
- **Centralized client** (`src/api.js`) — wraps every server endpoint; no direct `fetch()` calls in components
- **Token management** — auto-fetches API token on first request, retries on 401 (stale token after restart)
- **Error handling** — on failure: logs `console.error` AND shows a toast notification via `useToast`
- **Toast notifications** — `ToastContainer.vue` renders stacked bottom-right notifications (error/success/info)

### Song Management
- **Four labels** — Ignored (gray, hidden by default), Fresh (red), Getting There (yellow), In Setlist (green)
- **Ignored label behavior** — songs labeled Ignored are hidden from library and randomizer by default; visible via filter checkboxes
- **Play tracking** — toggle played status with increment play count, display count
- **Per-song settings** — font size offset, merge, separators, alt colors — all saved per favorite
- **Kanban board** — drag songs between label columns, settings cog to show/hide Ignored column, context menu on cards, confetti + party sound; click title for randomized TTS "KANBAN!" (5% chance Easter egg phrase)
- **Song randomizer** — slot-machine carousel with tick sounds, Spotify autoplay, gold confetti, impact sound, celebrations; Space to spin; right-click winner for context menu
- **Context menus** — right-click context menu available on library cards, dashboard song cards, kanban cards, and randomizer winner (label, played, play count, delete)

### Keyboard Shortcuts
| Key | Dashboard | Lyrics | Library |
|-----|-----------|--------|---------|
| `Space` | → Library | *(nothing)* | *(disabled)* |
| `Escape` | *(nothing)* | → Library | → Dashboard |
| `R` | Randomizer modal | Randomizer modal | Randomizer modal |
| `T` | — | UG import | — |
| `C` | — | Toggle chords | — |
| `P` | — | Toggle Spotify | — |
| `+` / `-` | — | Adjust font | — |
| `← → ↑ ↓` | — | Navigate pages | — |

Escape always closes the topmost modal first (settings, kanban, randomizer) before navigating pages.
All shortcuts blocked when any modal is open.

## Production

```bash
npm run build               # Build to dist/
npm start                   # Express serves dist/ + API on port 3000
```

## Database

SQLite database at `server/data/lyricmachine.db`. **Automatic backups** on every server startup — stored in `server/data/backups/`, keeps last 3 timestamped copies.

## Testing

Vitest test suite with happy-dom for Vue component support.

```bash
npm test                    # Run all tests once
npm run test:watch          # Watch mode
```

6 tiers of tests:
- **Tier 1 — Pure functions**: `shared/normalize`, `titleParser`, `chordParser`
- **Tier 2 — Server logic**: column-name assertions, `spotifyFetch` retry/throw, `parseBody` size limit, authMiddleware token/CSRF validation
- **Tier 3 — Server integration**: DB schema + CRUD via in-memory SQLite, API route handlers with mock req/res
- **Tier 4 — Client composables**: `api.js`, `useToast`, `useFavorites`, `useSettings`, `useNavigation`, `useKeyboard`, `useChords`, `useUGImport`, `usePlaylistSync`, `useSpotifyAuth`
- **Tier 5 — Client utilities**: `adjustDropdown`
- **Tier 6 — Components**: `LyricsDisplay` algorithms, `MdiIcon`, `StarButton`, `NewSongForm`, `ContextMenu`, `ToastContainer`

When adding new features, add tests in the appropriate `tests/` subdirectory.

## ⚠️ MANDATORY — Data Safety Rules

> **THESE RULES ARE NON-NEGOTIABLE. VIOLATING THEM CAUSES REAL DATA LOSS.**

### Tests MUST NEVER touch production data
- **NEVER** `import` or `require` `server/db.js` in any test file. It creates a singleton connection to the production SQLite database.
- **ALWAYS** use `new DatabaseSync(':memory:')` (in-memory SQLite) for any test that needs a database.
- **ALWAYS** add `// @vitest-environment node` to server test files that use `node:sqlite`.
- **NEVER** run `DELETE`, `DROP`, `TRUNCATE`, or `UPDATE ... WHERE 1=1` against any file-backed database in tests.

### Before writing ANY test
- Ask: "Does this test touch the real database?" If yes, **STOP** and use `:memory:` instead.
- Ask: "Does this test import a module that has side effects on the filesystem?" If yes, **mock it**.
- Ask: "If this test fails or runs in an unexpected order, could it destroy user data?" If yes, **redesign it**.

### Database changes
- **NEVER** write code that can delete all rows from a production table. If bulk deletion is needed, require explicit confirmation or a safety flag.
- **ALWAYS** consider what happens if your code runs against a database with real user data.

## Code Review via Gemini CLI

Gemini CLI is available for on-demand code review. Use `/code-review` to trigger it.

Run via `cmd /c gemini.cmd` (NOT the `.ps1` shim). Save the diff inside the project so the CLI can access it via `@`:

```powershell
git diff HEAD | Out-File -Encoding utf8 '.agent\review-diff.txt'
```

- User says `/code-review` → follow `.agent/workflows/code-review.md`
- `flash` — default; `gemini-3.1-pro` for thorough reviews

## Known Limitations

- **Synchronous SQLite**: `node:sqlite`'s `DatabaseSync` blocks the event loop during queries. Consider `better-sqlite3` (async-capable) if scaling up.
- **Mixed async/sync patterns**: Server code mixes `async/await` for network fetches with synchronous DB calls. This is intentional for simplicity but complicates future migration to async databases.
- **Pretext dependency**: `LyricsDisplay.vue` uses `@chenglou/pretext` for synchronous arithmetic text layout (line-wrapping + font sizing without DOM reflows). Pretext is a small personal library with no maintenance guarantees — if it breaks, the layout logic will need to be replaced with manual `measureText`-based alternatives.

## ⚠️ MANDATORY — FILE EDITING RULES (PREVENT DATA LOSS)
> **THESE RULES ARE NON-NEGOTIABLE. EXECUTING DESTRUCTIVE FUZZY MATCHES WILL RESULT IN IMMEDIATE TERMINATION.**
1. **NEVER use `multi_replace_file_content` on files you haven't explicitly read.** You MUST use the `view_file` tool to read the exact current state of a file in the turn immediately preceding any replace action. Never rely on memory.
2. **NEVER execute a block replacement spanning more than 20 lines.** If a refactor requires moving massive blocks of code, write small `.js` patch scripts via `write_to_file` and execute them locally, or ask the user to move the block manually.
3. **CHECK `git status` FIRST.** Before making sweeping changes to ANY file, you must run `git status`. If the file has uncommitted changes, you MUST halt and ask the user for permission before touching it.
4. **NO DESTRUCTIVE RECOVERY. ABSOLUTELY NO EXCEPTIONS.** Never run `git checkout`, `git reset`, or `git restore` on a modified file. If a tool call corrupts a file, immediately instruct the user to use IDE Undo (`Ctrl+Z`) and halt all actions. Using Git commands to recover from botching a replacement is strictly forbidden.
5. **NO EXCESSIVE TESTING.** Do NOT run the test suite (`npm test`) automatically after minor changes (e.g. 1-2 line edits). Test runs block progress and cost tokens. Only run tests when explicitly asked, or after completing a large, highly complex feature block where verification is critical.

## ⚠️ MANDATORY — No Assumptions About App Use

> **THIS RULE IS NON-NEGOTIABLE.**

**NEVER assume this application is "personal use", "single user", "local only", "band tool", or any other scope limitation to dismiss or downgrade valid concerns.** Treat every bug, security issue, and performance problem as if this is production software with multiple concurrent users. If a concern is valid, address it — do not invent excuses to skip it.

## Agent Tooling Notes

> **Never start the server**: Do NOT run `npm run dev`, `npm start`, or any command that starts the dev/production server. The user manages the server lifecycle. If a restart is needed after your changes, tell the user to restart.

> **`grep_search` bug**: Single-file `SearchPath` always returns "No results found". Use **directory** as `SearchPath` + `Includes` glob to filter. Example: `SearchPath: src/components`, `Includes: ["SongRandomizer.vue"]`.

> **No browser agent**: Do NOT use the `browser_subagent` tool. It is unreliable and wastes time. Test locally or ask the user to verify.
