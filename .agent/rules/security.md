# Security Rules

## Secrets Management
- All secrets live in `.env` (gitignored) and are loaded via `server/api.js → loadEnv()`
- **Never** hardcode API keys, tokens, or credentials in source files
- **Never** log secret values — only log descriptive errors
- Reference `.env.example` for required variable names

## CORS
- The `/api/import-raw` endpoint uses `Access-Control-Allow-Origin: *` — this is intentional for the bookmarklet flow
- Other endpoints do not set CORS headers (same-origin only)

## External API Access
- Spotify tokens are cached in-memory with expiry tracking
- The `/api/open-ug` endpoint runs `exec()` to open a browser — sanitize inputs and avoid command injection
- All user-provided query params must be validated before use

## Client-Side
- localStorage data is user-controlled; never trust it for security-critical logic
- No authentication system — this is a single-user local tool
