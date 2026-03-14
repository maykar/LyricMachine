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
- Keyboard shortcuts (Space, T, C, P, Escape) are centralized in `useKeyboard.js`
- Transitions use JS hooks (Web Animations API), not CSS transitions

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

## File Naming
- Components: PascalCase (e.g., `LibraryOverlay.vue`)
- Composables: camelCase with `use` prefix (e.g., `useFavorites.js`)
- Server modules: camelCase (e.g., `chordParser.js`)
