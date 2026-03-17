---
name: add-composable
description: How to create a new Vue composable for LyricMachine
---

# Creating a New Composable

1. Create `src/composables/use<Name>.js`
2. Export a single function `use<Name>` that returns reactive state and methods
3. Use `ref`, `computed`, `watch` from Vue — no `reactive()` for top-level state
4. If the composable needs favorites access, accept `favorites` ref as a parameter (dependency injection pattern used throughout)
5. Keep side effects (fetch, timers) inside the composable — clean up in `onUnmounted` if needed
6. Wire it up in `App.vue` alongside other composables

## Module-Level vs Function-Level State

Some composables use **module-level state** (refs declared outside the function) so all consumers share the same instance. This pattern is used for:
- `useNavigation.js` — page + modal stack (singleton, shared across all components)
- `useFavorites.js` — favorites data (singleton, shared across all components)

Use module-level state when the composable manages **app-wide singleton state**. Use function-level state (refs inside the function) when each consumer needs its own instance.

## Template

```js
import { ref, computed } from 'vue'
import { api } from '../api.js'

export function use<Name>(/* dependencies */) {
  const myState = ref(null)

  function doSomething() {
    // Use api.* instead of direct fetch() calls
    const data = await api.myEndpoint()
  }

  return { myState, doSomething }
}
```

## API Access

All server calls MUST go through `src/api.js` — never use `fetch()` directly. The API client handles error logging and toast notifications automatically.

## Existing composables for reference
- `useNavigation.js` — unified navigation: 3 pages (dashboard/library/lyrics) + modal stack (settings/kanban/randomizer)
- `useKeyboard.js` — global keyboard shortcuts, Escape calls `dismissTop()`
- `useFavorites.js` — singleton store: favorites CRUD via api.js, current song state
- `useSettings.js` — user defaults management via api.js
- `useChords.js` — chord data fetching and caching
- `useUGImport.js` — bookmarklet import polling
- `usePlaylistSync.js` — Spotify playlist sync + album art backfill
- `useSpotifyAuth.js` — client-side Spotify connection state (connected/user/status) via api.js
- `useToast.js` — singleton toast notifications (showToast, dismissToast)

## Testing

Add tests for new composables in `tests/client/use<Name>.test.js`. Mock `api.js` with `vi.mock()` to isolate composable logic. Run `npm test` to verify.
