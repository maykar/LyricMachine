# 🎸 LyricMachine

Live lyrics display and song management for band jams.

![SloshRat](public/SloshRat.png)

## Features

- **Dynamic Lyrics Engine** — multi-column auto-layout, multi-page pagination, line merging, repeat collapsing ("x3"), inline editing, and binary-search font sizing that prevents reflows.
- **UG Chord Import & Transposition** — extract chords via bookmarklet, instantly transpose by semitone (with slash chord support), and auto-detect Capo.
- **Spotify Synchronization** — auto-imports songs from a source playlist, tracks "not in playlist" removals, and backfills Album Art via the Spotify API.
- **Spotify Web Playback SDK** — autoplays full tracks directly in the browser (Premium) with an intelligent fallback to 30s iframe previews.
- **Automated Lyrics Fetch** — automatically pulls plain lyrics via [Lrclib.net](https://lrclib.net) based on Spotify metadata.
- **Advanced Library Management** — paginated 3-4 column grid, drag-and-drop reordering, robust right-click context menus, and multi-filter/sort capabilities.
- **Interactive Kanban Board** — drag songs across 4 intuitive progress states (*Ignored, Fresh, Getting There, In Setlist*).
- **Song Randomizer** — slot-machine style song picker with celebration confetti, custom SFX, and Spotify autoplay integration.
- **Per-Song Persistence** — customized font sizes, visual separators, line merging, and play counts are securely persisted to local SQLite.
- **Global Keyboard Shortcuts** — Space (library), Escape (navigate back/dismiss), T (UG search), C (toggle chords), R (randomizer), P (player).

## Quick Start

\`\`\`bash
npm install
cp .env.example .env        # Fill in your Spotify credentials
npm run dev                  # Start Vite dev server + API
\`\`\`

> [!IMPORTANT]
> The dev server runs locally over HTTPS at **https://127.0.0.1:5555**. 
> You'll likely need to bypass the browser's warning about the self-signed certificate.

## Environment Variables

Copy \`.env.example\` to \`.env\`. The application requires very little manual configuration:

| Variable | Description |
|----------|-------------|
| \`SPOTIFY_CLIENT_ID\` | From [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| \`SPOTIFY_CLIENT_SECRET\` | From Spotify Developer Dashboard |
| \`SPOTIFY_REDIRECT_URI\` | Must be exactly \`https://127.0.0.1:5555/api/spotify/callback\` for local dev. |

> [!NOTE]
> • The **Source Playlist** is now managed entirely in the App Settings UI, you do not need its ID in \`.env\`.
> • Both \`API_TOKEN\` and \`ENCRYPTION_KEY\` manage security automatically — they are generated dynamically and appended to your \`.env\` file on initial startup.

## Database & Persistence

Data is stored in local SQLite (\`server/data/lyricmachine.db\`) utilizing the built-in \`node:sqlite\` driver. 
* Safe by default: A backup snapshot is automatically triggered every single time the server starts up and stored in \`server/data/backups\`.

## Production

\`\`\`bash
npm run build                # Bundle the SPA frontend
npm start                    # Serve API and static files on http://localhost:3000
\`\`\`

## Architecture & Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | Vue 3 (\`<script setup>\`), Pinia |
| **Build/Dev** | Vite 7 |
| **Backend** | Express 5 (Node "type": "module") |
| **Database** | SQLite (Node \`node:sqlite\` Sync) |
| **Design** | Vanilla CSS, responsive rem scaling |
