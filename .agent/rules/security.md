# Security Rules

## ⚠️ Data Safety — HIGHEST PRIORITY

> **A test that touches the production database is a test that can destroy weeks of user data. This has happened before. It MUST NEVER happen again.**

### Test Isolation
- **NEVER** import `server/db.js` in tests — it opens a singleton connection to the production database
- **ALWAYS** use `new DatabaseSync(':memory:')` for database tests
- **NEVER** run destructive SQL (`DELETE`, `DROP`, `TRUNCATE`, bulk `UPDATE`) against any file-backed database in test code
- **ALWAYS** mock modules that have filesystem side effects when writing tests
- Server tests **MUST** include `// @vitest-environment node` at the top of the file

### Before Writing Any Code That Touches Data
1. Ask: "If this code runs against the production database, what happens?"
2. Ask: "If this code runs twice, does it destroy data?"
3. Ask: "Is there a backup in case this goes wrong?"
4. If ANY answer raises concern → **STOP and redesign**

### Database Backups
- `server/db.js` creates automatic timestamped backups on every startup
- Backups stored in `server/data/backups/` (gitignored, kept on disk)
- Last 10 backups retained, older ones rotated out
- Export/import via settings UI provides user-controlled backup

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

