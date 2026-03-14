# 🎸 LyricMachine

Live lyrics display and song management for band jams.

![SloshRat](public/SloshRat.png)

## Features

- **Spotify Playlist Sync** — auto-imports songs from a Spotify playlist
- **Lyrics Auto-Fetch** — fetches plain lyrics from [lrclib.net](https://lrclib.net)
- **UG Chord Import** — bookmarklet extracts chord charts from Ultimate Guitar
- **Song Library** — search, filter by label, Kanban board view
- **Song Randomizer** — slot-machine style random song picker with confetti 🎉
- **Chord Drawer** — collapsible footer showing parsed chord progressions
- **Spotify Player** — embedded playback widget
- **Keyboard Shortcuts** — Space (library), T (UG search), C (chords), P (player)
- **Per-Song Settings** — font size, merge lines, separators, alternating colors
- **Play Tracking** — mark songs as played with play count

## Quick Start

```bash
npm install
cp .env.example .env        # Fill in your Spotify credentials
npm run dev                  # http://localhost:5555
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | From [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard |
| `SPOTIFY_PLAYLIST_ID` | The playlist ID to sync songs from |

## Production

```bash
npm run build
npm start                    # http://localhost:3000
```

## Tech Stack

Vue 3 • Vite 7 • Express 5 • Vanilla CSS
