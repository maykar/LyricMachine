-- 005_fix_corrupted_sus_chords.sql
-- Description: Repair 'sus' chords that were corrupted into '#us' by a previous regex parser bug

UPDATE songs 
SET custom_chords = REPLACE(custom_chords, '#us', 'sus') 
WHERE custom_chords IS NOT NULL AND custom_chords LIKE '%#us%';
