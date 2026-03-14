---
name: add-api-route
description: How to add a new server API route to LyricMachine
---

# Adding a New API Route

The Express API is mounted as Vite middleware in dev and as standalone Express in production.

## Steps

1. **Create or modify a handler** in `server/` (e.g., `server/myFeature.js`)
2. Export a setup function: `export function setupMyRoutes(server) { ... }`
3. Register it in `server/api.js` inside `setupAPI()`:
   ```js
   import { setupMyRoutes } from './myFeature.js'
   // inside setupAPI:
   setupMyRoutes(server)
   ```
4. Routes use low-level `server.use(path, handler)` pattern (compatible with both Vite middleware and Express)

## Handler Pattern

```js
server.use('/api/my-endpoint', async (req, res, next) => {
  if (req.method !== 'GET') return next()  // filter HTTP method
  
  try {
    // ... logic
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    console.error('My endpoint error:', err.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
})
```

## Important Notes
- Use `res.writeHead()` + `res.end()` (not `res.json()`) for Vite middleware compatibility
- Parse request body manually with stream events (see `parseBody` in `ugImport.js`)
- Access query params via `req.query` (Express) or `new URL(req.url, 'http://x').searchParams` (Vite)
- Environment variables available via `process.env` after `loadEnv()` runs
