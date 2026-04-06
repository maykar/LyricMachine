-- 004_add_aggressive_formatting.sql
-- Description: Add merge_aggressive and collapse_chorus columns to songs table

ALTER TABLE songs ADD COLUMN merge_aggressive INTEGER DEFAULT 0;
ALTER TABLE songs ADD COLUMN collapse_chorus INTEGER DEFAULT 0;
