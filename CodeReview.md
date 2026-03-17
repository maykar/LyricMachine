# Code Review — Remaining Items

> Items not addressed in the current round of fixes. Kept here for future reference.

---

## Bookmarklet

### Hardcoded URL
[bookmarklet.js:2](file:///c:/Users/theme/Desktop/LyricMachine/server/bookmarklet.js#L2) hardcodes `localhost:5555`. The `/api/bookmarklet` endpoint has access to `req.headers.host` — should inject the correct host dynamically so production builds on port 3000 work.

### sendBeacon Content-Type
[bookmarklet.js:18-19](file:///c:/Users/theme/Desktop/LyricMachine/server/bookmarklet.js#L18-L19) sends JSON with `text/plain` Content-Type. Works because `parseBody` ignores Content-Type, but semantically wrong.

---

## Component Issues

### LibraryOverlay — Partial Filter Persistence
Only `hidePlayed` and `noChords` are persisted via `api.setFilters()`. Label filters, sort settings, and `filterNotInPlaylist` reset on every mount.

### LyricsDisplay — Font Cache Never Evicts
[LyricsDisplay.vue:61](file:///c:/Users/theme/Desktop/LyricMachine/src/components/LyricsDisplay.vue#L61) — Module-scope `Map()` grows unbounded. Clears on resize but not on song navigation. Consider LRU cap (~50 entries).

### SongRandomizer — Direct DOM Manipulation
[SongRandomizer.vue:351-356](file:///c:/Users/theme/Desktop/LyricMachine/src/components/SongRandomizer.vue#L351-L356) uses `document.querySelector('.carousel-card.is-winner')` instead of template refs. Fragile if DOM structure changes.

---

## Architecture

### Route Registration Uses Prefix Matching
[api.js:128-138](file:///c:/Users/theme/Desktop/LyricMachine/server/api.js#L128-L138) — `GET /api/songs` handler manually rejects sub-paths because `server.use()` matches by prefix. Error-prone; consider exact path matching.

### No Settings Key Whitelist
[api.js:230](file:///c:/Users/theme/Desktop/LyricMachine/server/api.js#L230) — Settings key extracted from URL with no validation. Parameterized queries prevent SQL injection, but arbitrary keys can be created in the DB.

---

## Security (acceptable for local tool)

- **CORS wildcard** on `/api/import-raw` — intentional for bookmarklet, any site can POST chord data
- **No CSRF** on mutation endpoints — acceptable for local-network tool

---

## Test Coverage Gaps

| Area | Status |
|---|---|
| Spotify auth flow | ❌ Not tested |
| Playlist sync engine | ❌ Not tested |
| `useNavigation` / `useKeyboard` | ❌ Not tested |
| UG import polling | ❌ Not tested |
| Production Express routing | ❌ Not tested |
| Component UI logic (context menu, drag-drop, filters) | ❌ Not tested |
