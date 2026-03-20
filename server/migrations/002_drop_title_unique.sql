-- 002_drop_title_unique.sql
-- Removes UNIQUE constraint from title column to allow songs with same title
-- but different spotify_track_id (e.g. "Home" by different artists)

-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table
-- This migration only runs if the old schema has UNIQUE on title
-- The migration runner handles the table-recreation logic for this special case

-- After table recreation, add compound unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_title_trackid ON songs(title, COALESCE(spotify_track_id, ''));
