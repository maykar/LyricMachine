# Security Rules

## Secrets Management
- All secrets live in `.env` (gitignored) and are loaded via `server/api.js → loadEnv()`
- **Never** hardcode API keys, tokens, or credentials in source files
- **Never** log secret values — only log descriptive errors
- Reference `.env.example` for required variable names

## Spotify Authentication
- Uses **Authorization Code flow** (not client credentials for user-facing features)
- Tokens (access + refresh) stored in SQLite `settings` table, encrypted at rest is NOT implemented — acceptable for single-user local tool
- Token refresh handled automatically via `spotifyAuth.js → getValidToken()`
- Client credentials flow still used for search-only operations (`spotify.js`)

## CORS
- The `/api/import-raw` endpoint uses `Access-Control-Allow-Origin: *` — this is intentional for the bookmarklet flow
- Other endpoints do not set CORS headers (same-origin only)

## External API Access
- Spotify OAuth tokens are stored in SQLite with expiry tracking
- The `/api/open-ug` endpoint runs `exec()` to open a browser — sanitize inputs and avoid command injection
- All user-provided query params must be validated before use

## Client-Side
- No authentication system — this is a single-user local tool
- All data persistence is server-side (SQLite), no sensitive data in localStorage
