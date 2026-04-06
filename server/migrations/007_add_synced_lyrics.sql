-- Add synced (timestamped LRC) lyrics and per-song view mode
ALTER TABLE songs ADD COLUMN synced_lyrics TEXT;
ALTER TABLE songs ADD COLUMN lyric_view TEXT DEFAULT 'standard';
