---
name: add-composable
description: How to create a new Vue composable for LyricMachine
---

# Creating a New Composable

1. Create `src/composables/use<Name>.js`
2. Export a single function `use<Name>` that returns reactive state and methods
3. Use `ref`, `computed`, `watch` from Vue — no `reactive()` for top-level state
4. If the composable needs favorites access, accept `getFavorites` and `saveFavoritesArray` as parameters (dependency injection pattern used throughout)
5. Keep side effects (fetch, timers) inside the composable — clean up in `onUnmounted` if needed
6. Wire it up in `App.vue` alongside other composables

## Template

```js
import { ref, computed } from 'vue'

export function use<Name>(/* dependencies */) {
  const myState = ref(null)

  function doSomething() {
    // ...
  }

  return { myState, doSomething }
}
```

## Existing composables for reference
- `useFavorites.js` — localStorage CRUD, current song state
- `useSettings.js` — user defaults management
- `useChords.js` — chord data fetching and caching
- `useUGImport.js` — bookmarklet import polling
- `usePlaylistSync.js` — Spotify playlist sync + album art backfill
- `useKeyboard.js` — global keyboard shortcuts
