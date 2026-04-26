# LyricMachine

A full-stack web application for live musical performance, setlist management, and dynamic lyrics display. Built to be used during live jam sessions.

<!-- [Screenshot: Main Library View] -->
<div align="center">
  <img src="public/SloshRat.png" alt="SloshRat" width="200" />
</div>

## Overview

LyricMachine combines a robust library management system with a high-performance, responsive lyrics and chords display. It deeply integrates with the Spotify Web API and Ultimate Guitar to automate data aggregation, allowing musicians to focus on the music.

<img width="1918" height="943" alt="image" src="https://github.com/user-attachments/assets/c8d52781-c9b1-45ce-a584-f719d8bbd85a" />
<img width="1919" height="977" alt="image" src="https://github.com/user-attachments/assets/d500c361-a518-4bf9-9dd1-3ab232bcc0d9" />
<img width="1919" height="976" alt="image" src="https://github.com/user-attachments/assets/62bd0038-5f1a-40ec-9df7-ada9d318b22f" />
<img width="1916" height="975" alt="image" src="https://github.com/user-attachments/assets/a7dea6ff-240d-482d-a60c-1103cd0e981e" />
<img width="1919" height="978" alt="image" src="https://github.com/user-attachments/assets/4795f5ac-46f7-4130-9934-733ca4183744" />

## Key Features

### Performance Display
<!-- [Gif: Lyrics scrolling and font resizing] -->
- **Zero-Reflow Lyrics Engine:** Custom DOM-based renderer utilizing binary-search font sizing and pretext arithmetic for zero-reflow, responsive text layouts across devices.
- **Dynamic Formatting:** Smart line merging for shorter phrases, repeat collapsing (e.g., "[Chorus] x3"), and alternating tint colors for repeated sections or specific vocal parts.
- **Teleprompter & Karaoke Modes:** Smooth, auto-scrolling teleprompter view and a dedicated Karaoke mode with synchronized lyric highlighting.
- **Intelligent Pagination:** Multi-column auto-layout and multi-page pagination that perfectly fits your screen size.
- **Chord Integration:** Import from Ultimate Guitar, instant transposition by semitone (including slash chords), and Capo auto-detection.

### Spotify Integration
<!-- [Screenshot: Spotify player and sync settings] -->
- **Bi-Directional Sync:** Robust synchronization engine with mutex guards and parallel fetching to keep your local library in sync with a Spotify source playlist.
- **Web Playback SDK:** Full track playback directly in the browser for Spotify Premium users, with an intelligent fallback to 30-second preview clips.
- **Automated Metadata:** Auto-imports songs, backfills album art, and fetches lyrics automatically via [Lrclib.net](https://lrclib.net).

### Library & Setlist Management
<!-- [Gif: Kanban board drag and drop] -->
- **Interactive Kanban Board:** Drag-and-drop songs across customizable progress states (e.g., Ignored, Fresh, Getting There, In Setlist).
- **Advanced Library View:** Paginated multi-column grid with robust right-click context menus, multi-filtering, and sorting capabilities.
- **Song Randomizer:** Slot-machine style random song picker with celebration effects and Spotify autoplay integration.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables. Copy `.env.example` to `.env` and fill in your Spotify credentials from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   - `SPOTIFY_CLIENT_ID`: Your client ID
   - `SPOTIFY_CLIENT_SECRET`: Your client secret
   - `SPOTIFY_REDIRECT_URI`: Must be exactly `https://127.0.0.1:5555/api/spotify/callback` for local development.

3. Start the development server:
```bash
npm run dev
```

> **Note:** The dev server runs locally over HTTPS at `https://127.0.0.1:5555`. You will need to bypass your browser's warning about the self-signed certificate.

## Architecture

Data is stored in a local SQLite database (`server/data/lyricmachine.db`) utilizing the built-in Node `node:sqlite` driver. The system automatically creates a backup snapshot in `server/data/backups` every time the server starts.

| Domain | Technology |
|---|---|
| **Frontend** | Vue 3 (Composition API), Pinia |
| **Build/Dev** | Vite 7 |
| **Backend** | Express 5 (ESM) |
| **Database** | SQLite (`node:sqlite` Sync) |
| **Styling** | Vanilla CSS, responsive rem scaling |

## Production Deployment

Bundle the SPA frontend and serve the API and static files:
```bash
npm run build
npm start
```
