-- 001_add_transpose_and_custom_labels.sql
-- Adds transpose offset for saved chord transpositions and custom_labels tag array

ALTER TABLE songs ADD COLUMN transpose INTEGER DEFAULT 0;
ALTER TABLE songs ADD COLUMN custom_labels TEXT DEFAULT '[]';
