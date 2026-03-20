# Code Reviewer — LyricMachine

> This file is read by **Gemini CLI only** (not Antigravity).
> It is auto-loaded when Gemini CLI runs from this project directory.

## Tech Stack
- **Frontend:** Vue 3 (`<script setup>`) + Vite 7
- **Backend:** Express 5 (ESM Node.js)
- **Database:** SQLite (via `node:sqlite`)
- **Styling:** Vanilla CSS, design tokens in `style-tokens.css`
- **APIs:** Spotify Web API, lrclib.net

## Architecture
- `src/composables/` — singleton stores, all state management
- `src/components/` — Vue SFCs, no direct fetch calls (use `src/api.js`)
- `server/` — Express routes, SQLite DB, Spotify integration
- `shared/` — code shared between client and server

## Review Priorities
1. Never modify production database in tests — use `:memory:` SQLite
2. All API calls go through `src/api.js` — never raw `fetch()` in components
3. Error handling: log + toast on failure
4. Keyboard shortcuts must respect modal stack (`useNavigation.js`)
5. Per-song settings saved via `useFavorites.js`
6. Title normalization via `shared/normalize.js` for Spotify matching
