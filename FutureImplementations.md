# Future Implementations

Ideas and features for future development. These require more significant effort and should be planned as dedicated sessions.

## better-sqlite3 Migration
Swap `node:sqlite` (experimental, `DatabaseSync`) for `better-sqlite3` — battle-tested, faster, supports WAL mode for concurrent reads during writes. Requires replacing all `DatabaseSync` calls and updating the test harness.

## Multi-Device Sync (SSE)
Server-Sent Events for real-time state push to multiple clients. When any client changes songs/labels/settings, the server broadcasts a `songs-updated` event. Clients listen and re-fetch as needed. Prevents state divergence when multiple people have the app open.

## Setlist Mode
A dedicated "tonight's setlist" view separate from the library. Drag-to-reorder list with time estimates, ability to pull songs from favorites. Persisted per-session. Could include a "next song" display mode for live performance.

## Offline Fallback
Service worker with cache-first strategy for the SPA shell + cached lyrics. If the server goes down mid-jam, the app stays usable with last-known data. Would need a sync-on-reconnect mechanism for any changes made offline.
