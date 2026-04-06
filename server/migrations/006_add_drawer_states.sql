-- 006_add_drawer_states.sql
-- Description: Add show_chords column to save drawer state per song

ALTER TABLE songs ADD COLUMN show_chords INTEGER;
