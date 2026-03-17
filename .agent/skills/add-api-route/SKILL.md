---
name: add-api-route
description: How to add a new server API route to LyricMachine
---

# Adding a New API Route

The Express API is mounted as Vite middleware in dev and as standalone Express in production.

## Steps

1. **Create or modify a handler** in `server/` (e.g., `server/myFeature.js`)
2. Export a setup function that receives route helpers:
   ```js
   export function setupMyRoutes(server, { get, post, json }) { ... }
   ```
3. Register it in `server/api.js` inside `setupAPI()`:
   ```js
   import { setupMyRoutes } from './myFeature.js'
   // inside setupAPI:
   setupMyRoutes(server, { get, post, json })
   ```

## Route Helper Pattern

Use the `get`, `post`, and `json` helpers provided by `api.js`:

```js
export function setupMyRoutes(server, { get, post, json }) {
  // GET endpoint
  get(server, '/api/my-endpoint', async (req, res) => {
    const data = { ok: true }
    json(res, data)
  })

  // POST endpoint with body parsing
  post(server, '/api/my-endpoint', async (req, res) => {
    const body = await parseBody(req)
    // ... logic
    json(res, { ok: true })
  })
}
```

## Route Helpers Reference

| Helper | Description |
|--------|-------------|
| `get(server, path, handler)` | Register a GET route |
| `post(server, path, handler)` | Register a POST route |
| `json(res, data, status?)` | Send JSON response (defaults to 200) |
| `parseBody(req)` | Parse JSON request body (import from `api.js`) |

## Database Access

Import prepared statements from `server/db.js`:

```js
import { stmts, db } from './db.js'

// Use prepared statements for common operations
const songs = stmts.allSongs.all()

// Or run ad-hoc queries
const result = db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
```

## Important Notes
- Route helpers work with both Vite middleware and production Express
- Use `parseBody(req)` from `api.js` for POST body parsing — enforces a 10MB size limit
- Access query params via `new URL(req.url, 'http://x').searchParams`
- Environment variables available via `process.env` after `loadEnv()` runs
- Error handling: wrap in try/catch, use `json(res, { error: msg }, 500)` for errors
- Column names in `db.js` are asserted via regex (`/^[a-z_]+$/`) to prevent SQL injection

## Client-Side Wrapper

After adding a server route, add a corresponding method to `src/api.js`:

```js
// In src/api.js — add to the api object:
export const api = {
  // ... existing methods
  myEndpoint: () => get('/api/my-endpoint'),
  createMyThing: (data) => post('/api/my-endpoint', data),
}
```

All client-side code MUST use `api.*` methods instead of direct `fetch()` calls. The API client automatically:
- Logs `console.error` on failure
- Fires toast notifications via `useToast`
- Returns parsed JSON or `null` on failure
