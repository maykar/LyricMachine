# LyricMachine — Maintainability Audit

## File Size Overview

| Lines | File | Concern |
|------:|------|---------|
| 1292 | SongRandomizer.vue | 🔴 Very large |
| 1141 | LibraryOverlay.vue | 🔴 Very large |
| 423 | LyricsDisplay.vue | 🟡 Moderate |
| 367 | ChordDrawer.vue | 🟡 Moderate |
| 354 | KanbanView.vue | 🟡 Moderate |
| 321 | Dashboard.vue | 🟢 OK |
| 291 | App.vue | 🟢 OK |

---

## 🔴 High Priority

### 1. SongRandomizer.vue is 1,292 lines — extract composable

This component has grown significantly. It contains:
- Carousel/spin animation logic (~200 lines)
- Confetti/celebration effects (~50 lines)
- Holographic shimmer + 3D tilt rAF loop (~80 lines)
- Spotify preload/warmup (~80 lines)
- Audio (tick, impact sounds) (~50 lines)
- Shuffle bag logic (~30 lines)
- Filter/sort state (~30 lines)
- CSS (~600 lines)

**Suggestion:** Extract a `useRandomizer.js` composable containing the spin animation, shuffle bag, celebrations, and audio. This would reduce the SFC to ~400 lines of template + CSS.

### 2. LibraryOverlay.vue is 1,141 lines — extract composable

This component handles:
- Search, pagination, context menu, drag-and-drop reorder
- Import/export JSON, new song form
- Filter/sort controls
- Card grid rendering

**Suggestion:** Extract a `useLibrary.js` composable for the search, filtering, pagination, and CRUD logic. The template + CSS would remain in the SFC.

### 3. Scoped CSS vs shared styles

SongRandomizer alone has ~600 lines of CSS. Most of it is scoped and cannot be reused. Shared card styles (`.carousel-card`, `.carousel-card-inner`, `.carousel-card-art`, etc.) could be shared with other components if extracted.

**Suggestion:** Move card-related CSS (`.carousel-card-*`) to `style.css` as global utility styles since they're used similarly in LibraryOverlay and KanbanView.

---

## 🟡 Medium Priority

### 4. Magic numbers scattered throughout

Examples from SongRandomizer:
- `cardWidth = 200`, `BUFFER_CARDS = 60`, `FLOAT_DURATION = 6000`
- `SPIN_DURATION = 1000`, tilt angles `33, 7, -33`, etc.
- Confetti params repeated inline

**Suggestion:** Group these into a `CONFIG` object at the top of each composable for easy tuning.

### 5. Spotify logic lives in the component

`SongRandomizer.vue` has ~80 lines of Spotify iframe warmup, preloading, and playback control. This is the same pattern used in `App.vue`.

**Suggestion:** Extract a `useSpotifyPlayer.js` composable that manages the shared `window.__spotify` state, iframe creation, preloading, and playback. Both `SongRandomizer` and `App` can consume it.

### 6. Direct DOM queries in Vue components

`SongRandomizer.vue` uses `document.querySelector('.carousel-card.is-winner')` and `document.querySelectorAll('.shimmer-overlay')` rather than Vue refs. This bypasses Vue's reactivity and could break if the DOM structure changes.

**Suggestion:** Use template refs (`ref="winnerCard"`) and pass them to the composable. This is more idiomatic Vue and safer.

---

## 🟢 Low Priority (Nice-to-Have)

### 7. No TypeScript

The project uses plain JS. Adding JSDoc type annotations to composable return values and props would help IDE autocomplete and catch bugs without fully migrating to TS.

### 8. Dead CSS

After removing pulse-ring, stars, and sparkles from the template, the CSS for `.pulse-ring`, `.star-*`, `.sparkle-*`, and their keyframes (~140 lines) may still be in the file.

**Suggestion:** Remove all unused CSS rules from SongRandomizer.vue.

### 9. Audio context management

Audio context creation and impact buffer loading are inline in SongRandomizer. If other features ever need audio, this would be duplicated.

**Suggestion:** Extract a `useAudio.js` composable for AudioContext management, sound loading, and playback.

### 10. Server code is solid

The server modules (`api.js`, `spotify.js`, `chordParser.js`, `ugImport.js`, `bookmarklet.js`) are all under 170 lines and well-scoped. No major concerns.

---

## Recommended Action Order

1. **Clean up dead CSS** in SongRandomizer.vue (quick win, ~140 lines removed)
2. **Extract `useRandomizer.js`** composable from SongRandomizer.vue
3. **Extract `useLibrary.js`** composable from LibraryOverlay.vue
4. **Group magic numbers** into config objects
5. **Replace DOM queries** with Vue template refs
