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
| APIs | Spotify Web API, lrclib.net |

## Project Structure

```
├── index.html              # SPA entry point
├── server.js               # Production Express server
├── vite.config.js           # Vite config + API plugin
├── server/
│   ├── api.js               # Route registry + .env loader
│   ├── spotify.js           # Spotify auth + search + playlist
│   ├── chordParser.js       # HTML→chord parser (from UG)
│   ├── ugImport.js          # Import/poll endpoints
│   └── bookmarklet.js       # Browser bookmarklet code
├── src/
│   ├── App.vue              # Root component
│   ├── main.js              # Vue app bootstrap
│   ├── style.css            # Global styles
│   ├── components/
│   │   ├── TopBar.vue       # Header: controls, page indicator
│   │   ├── LyricsDisplay.vue# Paginated lyrics rendering
│   │   ├── LibraryOverlay.vue# Song library w/ search, filters, Kanban
│   │   ├── KanbanView.vue   # Kanban board for song categorization
│   │   ├── SongRandomizer.vue# Slot-machine song picker
│   │   ├── ChordDrawer.vue  # Collapsible chord chart footer
│   │   ├── SettingsDropdown.vue# Defaults + shortcuts panel
│   │   ├── SpotifyPlayer.vue# Embedded Spotify player
│   │   ├── SearchOverlay.vue# Quick song search
│   │   ├── FavoritesOverlay.vue# Favorites list
│   │   ├── StarButton.vue   # Star/unsave toggle
│   │   └── MdiIcon.vue      # SVG icon wrapper
│   └── composables/
│       ├── useFavorites.js  # Favorites CRUD + current song state
│       ├── useSettings.js   # User defaults (merge, separators, altColors)
│       ├── useChords.js     # Chord fetching + Spotify ID lookup
│       ├── useUGImport.js   # UG bookmarklet import polling
│       ├── usePlaylistSync.js# Spotify playlist sync + album art backfill
│       └── useKeyboard.js   # Global keyboard shortcuts
└── public/
    ├── SloshRat.png         # Mascot image
    ├── party.wav            # Sound effect
    └── special.wav          # Sound effect
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

- **Spotify Playlist Sync** — auto-imports songs from a Spotify playlist on startup
- **Lyrics Auto-Fetch** — fetches plain lyrics from lrclib.net
- **UG Chord Import** — bookmarklet extracts chord charts from Ultimate Guitar
- **Song Library** — search, filter by label (fresh/learning/ready/retired), Kanban view
- **Song Randomizer** — slot-machine style random song picker with confetti
- **Chord Drawer** — collapsible footer showing parsed chord progressions
- **Spotify Player** — embedded playback via Spotify embed
- **Keyboard Shortcuts** — Space (library), T (UG search), C (chords), P (player), Escape (close)
- **Per-Song Settings** — font size, merge lines, separators, alternating colors
- **Play Tracking** — mark songs as played with play count

## Production

```bash
npm run build               # Build to dist/
npm start                   # Express serves dist/ + API on port 3000
```
