# LyricMachine

> Live lyrics display and song management for band jams.

## What is this?

LyricMachine helps musicians display song lyrics, chords, and Spotify playback during live jam sessions. It syncs with a Spotify playlist, auto-fetches lyrics from lrclib.net, and lets you import chord charts from Ultimate Guitar via a browser bookmarklet.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3 (`<script setup>`) + Vite 7 |
| Backend | Express 5 (ESM Node.js) |
| Styling | Vanilla CSS, Inter font |
| Icons | `@mdi/js` |
| State | localStorage |
| APIs | Spotify Web API, lrclib.net, Ultimate Guitar (via bookmarklet) |

## Project Structure

```
├── index.html              # SPA entry point
├── server.js               # Production Express server
├── vite.config.js           # Vite config + API plugin
├── server/
│   ├── api.js               # Route registry + .env loader
│   ├── spotify.js           # Spotify auth + search + playlist sync
│   ├── chordParser.js       # HTML→chord parser (from UG pre.innerHTML)
│   ├── ugImport.js          # Import/poll endpoints + bookmarklet page
│   └── bookmarklet.js       # Browser bookmarklet code
├── src/
│   ├── App.vue              # Root component — wires all features together
│   ├── main.js              # Vue app bootstrap
│   ├── style.css            # Global styles
│   ├── components/
│   │   ├── TopBar.vue       # Header: font controls, edit, search, played, label, star, page indicator
│   │   ├── LyricsDisplay.vue# Multi-column (2–3) lyrics with auto-fit font, pagination, merge, collapse repeats, alt colors, separators
│   │   ├── LibraryOverlay.vue# Full-screen library: search lrclib, favorites grid, drag-and-drop reorder, context menu (label/played/delete), filter (played/no-chords/label), sort (label/playCount), export/import JSON, new song form, Kanban/Randomizer launchers
│   │   ├── KanbanView.vue   # Kanban board for song categorization (fresh/getting-there/in-setlist) with drag-and-drop, confetti, party sound
│   │   ├── SongRandomizer.vue# Slot-machine random song picker with carousel animation, tick sounds, Spotify preload, confetti, impact sound, light rays, fireworks
│   │   ├── ChordDrawer.vue  # Collapsible chord chart footer with transpose (semitone up/down/reset, slash chord support), edit mode (add/remove sections, structure input), capo display
│   │   ├── SettingsDropdown.vue# Defaults (merge/separators/altColors), apply to all, clear chords, clear played, keyboard shortcuts reference, UG bookmarklet setup
│   │   ├── SpotifyPlayer.vue# Embedded Spotify player via iframe
│   │   ├── SearchOverlay.vue# Quick single-result song search via lrclib
│   │   ├── FavoritesOverlay.vue# Simple favorites list with export/import JSON and remove
│   │   ├── StarButton.vue   # Star/unsave toggle
│   │   └── MdiIcon.vue      # SVG icon wrapper
│   └── composables/
│       ├── useFavorites.js  # Favorites CRUD, per-song settings (font/merge/separators/altColors), label management, play tracking (played boolean + playCount), data migration
│       ├── useSettings.js   # User defaults persistence, apply-to-all, clear-all-chords
│       ├── useChords.js     # Chord fetching from saved data, Spotify track ID lookup + cache, chord editing + reset
│       ├── useUGImport.js   # UG bookmarklet import polling (2s interval, 2min timeout)
│       ├── usePlaylistSync.js# Spotify playlist sync with title normalization, lyrics auto-fetch from lrclib, album art backfill
│       └── useKeyboard.js   # Global keyboard shortcuts (Space/Escape/R/T/C/P, context-aware navigation)
└── public/
    ├── SloshRat.png         # Mascot image
    ├── party.ogg            # Kanban celebration sound
    └── special.ogg          # Randomizer impact sound
```

## Setup

```bash
npm install
cp .env.example .env        # Fill in your Spotify credentials
npm run dev                  # Vite dev server on http://localhost:5555
```

## Environment Variables

See `.env.example` for required variables. Never commit `.env`.

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
- **Spotify playlist sync** — auto-imports songs on startup with title normalization for dedup
- **Lyrics auto-fetch** — fetches plain lyrics from lrclib.net for synced songs
- **Album art backfill** — fetches album art from Spotify API for songs missing it
- **Search** — search lrclib.net with debounce, inline star/favorite from results
- **Export/Import** — download favorites as JSON, import with merge (dedup by title)
- **New song creation** — manual artist + track + lyrics form
- **Drag-and-drop reorder** — reorder favorites by dragging cards
- **Context menu** — right-click for label change, played toggle, edit play count, clear count, delete; Ctrl+right-click for native browser menu
- **Filters** — unplayed, no chords, by label (Fresh/Getting There/In Setlist)
- **Sort** — by label or play count, ascending/descending toggle
- **Paginated grid** — 4-column card grid with dynamic row count based on viewport
- **Word-boundary truncation** — card text truncates at clean word boundaries, never leaving trailing spaces

### Song Management
- **Three labels** — Fresh (red), Getting There (yellow), In Setlist (green)
- **Play tracking** — toggle played status with increment play count, display count
- **Per-song settings** — font size offset, merge, separators, alt colors — all saved per favorite
- **Kanban board** — drag songs between label columns, confetti + party sound; click title for randomized TTS "KANBAN!" (5% chance Easter egg phrase), random voice/pitch/rate
- **Song randomizer** — slot-machine carousel with tick sounds, Spotify autoplay, gold confetti, impact sound, celebrations; Space to spin

### Playback
- **Spotify player** — embedded iframe player, auto-lookup track ID
- **Spotify track ID caching** — cached to favorites to avoid repeated API calls

### Keyboard Shortcuts
| Key | Dashboard | Lyrics | Library | Randomizer |
|-----|-----------|--------|---------|------------|
| `Space` | → Library | → Library | *(disabled)* | Spin |
| `Escape` | *(nothing)* | → Library | → Dashboard | → Library |
| `R` | → Randomizer | → Randomizer | → Randomizer | *(disabled)* |
| `T` | — | UG import | — | — |
| `C` | — | Toggle chords | — | — |
| `P` | — | Toggle Spotify | — | — |
| `M` | — | Toggle merge | — | — |
| `L` | — | Toggle separators | — | — |
| `H` | — | Toggle alt colors | — | — |
| `+` / `-` | — | Adjust font | — | — |
| `← → ↑ ↓` | — | Navigate pages | — | — |
| `Enter` | — | — | — | Select winner |

## Production

```bash
npm run build               # Build to dist/
npm start                   # Express serves dist/ + API on port 3000
```

## Agent Tooling Notes

> **`grep_search` bug**: Single-file `SearchPath` always returns "No results found". Use **directory** as `SearchPath` + `Includes` glob to filter. Example: `SearchPath: src/components`, `Includes: ["SongRandomizer.vue"]`.
