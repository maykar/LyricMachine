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
| Styling | Vanilla CSS, Inter font |
| Icons | `@mdi/js` |
| APIs | Spotify Web API (Authorization Code flow), lrclib.net, Ultimate Guitar (via bookmarklet) |

## Project Structure

```
├── index.html              # SPA entry point
├── server.js               # Production Express server
├── vite.config.js           # Vite config + API plugin (dev server binds 127.0.0.1)
├── server/
│   ├── api.js               # Route registry + .env loader + parseBody helper
│   ├── db.js                # SQLite database (songs, settings tables)
│   ├── spotify.js           # Spotify client-credentials search + playlist sync
│   ├── spotifyAuth.js       # Spotify Authorization Code flow (login, callback, token refresh)
│   ├── spotifyPlaylists.js  # Label-based playlist sync engine + add-to-source endpoint
│   ├── chordParser.js       # HTML→chord parser (from UG pre.innerHTML)
│   ├── ugImport.js          # Import/poll endpoints + bookmarklet page
│   ├── bookmarklet.js       # Browser bookmarklet code
│   └── popularArt.js        # Dashboard album art mosaic helper
├── src/
│   ├── App.vue              # Root component — wires all features together
│   ├── main.js              # Vue app bootstrap
│   ├── style.css            # Global styles
│   ├── style-tokens.css     # Design tokens (colors, spacing, radii, etc.)
│   ├── constants/
│   │   └── labels.js        # Kanban label definitions (Fresh/Getting There/In Setlist)
│   ├── utils/
│   │   └── titleParser.js   # Title normalization + "Artist — Track" splitting
│   ├── components/
│   │   ├── TopBar.vue       # Header: font controls, edit, search, played, label, star, page indicator (lyrics page only)
│   │   ├── LyricsDisplay.vue# Multi-column (2–3) lyrics with auto-fit font, pagination, merge, collapse repeats, alt colors, separators
│   │   ├── LibraryOverlay.vue# Library page: search lrclib, favorites grid, drag-and-drop reorder, context menu, filters, sort, new song form
│   │   ├── Dashboard.vue    # Home page: album art mosaic, recently added, most played, label breakdown bar
│   │   ├── KanbanView.vue   # Kanban board modal for song categorization with drag-and-drop, confetti, party sound
│   │   ├── SongRandomizer.vue# Slot-machine random song picker modal with carousel animation, celebrations
│   │   ├── ChordDrawer.vue  # Collapsible chord chart footer with transpose, edit mode, capo display
│   │   ├── SettingsDropdown.vue# Settings modal: defaults, Spotify connection, band name, source playlist picker, sync button
│   │   ├── SpotifyPlayer.vue# Embedded Spotify player via iframe
│   │   ├── ContextMenu.vue  # Right-click context menu (label/played/delete/add-to-source)
│   │   ├── NewSongForm.vue  # Manual song creation form (artist + track + lyrics)
│   │   ├── SearchOverlay.vue# Quick single-result song search via lrclib
│   │   ├── FavoritesOverlay.vue# Simple favorites list with export/import JSON and remove
│   │   ├── StarButton.vue   # Star/unsave toggle
│   │   └── MdiIcon.vue      # SVG icon wrapper
│   └── composables/
│       ├── useNavigation.js # Unified navigation: 3 pages (dashboard/library/lyrics) + modal stack (settings/kanban/randomizer)
│       ├── useKeyboard.js   # Global keyboard shortcuts — Escape calls dismissTop(), shortcuts blocked when modal open
│       ├── useFavorites.js  # Favorites CRUD via server API, per-song settings, label management, play tracking
│       ├── useSettings.js   # User defaults persistence, apply-to-all, clear-all-chords
│       ├── useChords.js     # Chord fetching from saved data, Spotify track ID lookup + cache, chord editing + reset
│       ├── useUGImport.js   # UG bookmarklet import polling (2s interval, 2min timeout)
│       ├── usePlaylistSync.js# Spotify playlist sync with title normalization, lyrics auto-fetch from lrclib, album art backfill
│       └── useSpotifyAuth.js# Client-side Spotify connection state (connected/user/status)
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
```

## Environment Variables

See `.env.example` for required variables. Never commit `.env`.

Required: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
Optional: `SPOTIFY_REDIRECT_URI` (defaults to `http://127.0.0.1:5555/api/spotify/callback`)

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
- **Paginated grid** — 4-column card grid with dynamic row count based on viewport
- **Word-boundary truncation** — card text truncates at clean word boundaries

### Spotify Integration
- **Authorization Code flow** — user logs in via Spotify OAuth, tokens stored in SQLite
- **Source playlist picker** — select which playlist to sync from via settings UI
- **Label-based playlists** — auto-creates Spotify playlists per label ({bandName} — {Label}), lazy creation
- **Bi-directional sync** — push local label changes to Spotify, pull Spotify changes to local
- **Auto-sync triggers** — label change (5s debounce), kanban close (immediate), app startup, kanban open (30s cooldown)
- **Podcast filtering** — non-track items skipped during sync
- **Embedded player** — iframe player with auto-lookup track ID, track ID caching

### Song Management
- **Three labels** — Fresh (red), Getting There (yellow), In Setlist (green)
- **Play tracking** — toggle played status with increment play count, display count
- **Per-song settings** — font size offset, merge, separators, alt colors — all saved per favorite
- **Kanban board** — drag songs between label columns, confetti + party sound; click title for randomized TTS "KANBAN!" (5% chance Easter egg phrase)
- **Song randomizer** — slot-machine carousel with tick sounds, Spotify autoplay, gold confetti, impact sound, celebrations; Space to spin

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

## Agent Tooling Notes

> **`grep_search` bug**: Single-file `SearchPath` always returns "No results found". Use **directory** as `SearchPath` + `Includes` glob to filter. Example: `SearchPath: src/components`, `Includes: ["SongRandomizer.vue"]`.

> **No browser agent**: Do NOT use the `browser_subagent` tool. It is unreliable and wastes time. Test locally or ask the user to verify.
