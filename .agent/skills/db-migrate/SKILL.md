---
name: db-migrate
description: How to create and manage database migrations for LyricMachine
---

# Database Migration Skill

## Overview

LyricMachine uses numbered SQL migration files in `server/migrations/`. Each migration runs once, tracked by a `schema_version` setting in the database.

## Creating a New Migration

1. Check the current highest migration number in `server/migrations/`
2. Create a new file: `server/migrations/NNN_description.sql` (zero-padded, e.g. `003_add_setlist_table.sql`)
3. Write **forward-only** SQL in the file. Each statement separated by `;`
4. The migration runner handles wrapping in a transaction

### Migration File Format

```sql
-- 003_add_setlist_table.sql
-- Description: Add setlist table for live performance tracking

CREATE TABLE IF NOT EXISTS setlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Rules

- **Forward-only** — no rollback/down migrations. If you need to undo, write a new migration.
- **Idempotent when possible** — use `IF NOT EXISTS`, `IF EXISTS` guards
- **Never modify existing migration files** — always create a new one
- **Test with in-memory DB** — add a test in `tests/server/` that runs the migration against `:memory:`

## Running Migrations

Migrations run automatically on server startup via `server/db.js`. The runner:
1. Reads `schema_version` from settings (default: 0)
2. Scans `server/migrations/` for files with number > current version
3. Executes them in order
4. Updates `schema_version` after each successful migration

## Checking Migration Status

Look at the `schema_version` setting in the database to see which migrations have been applied.
