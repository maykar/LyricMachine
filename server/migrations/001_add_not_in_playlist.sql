-- 001_add_not_in_playlist.sql
-- Adds not_in_playlist column for tracking songs removed from source playlist

ALTER TABLE songs ADD COLUMN not_in_playlist INTEGER DEFAULT 0;
