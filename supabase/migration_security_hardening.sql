-- Security hardening migration
-- Safe to run against an existing database; all operations are idempotent.
-- Run this in the Supabase SQL editor.

-- 1. Unique index: prevents the same song being added twice under the same parent.
--    Covers the case where the API rate-limiter or chain-duplicate check is bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_music_nodes_unique_child
  ON music_nodes (parent_id, lower(song_title), lower(artist))
  WHERE parent_id IS NOT NULL;

-- 2. Replace the open insert policy with one that enforces field length limits.
DROP POLICY IF EXISTS "Public insert" ON music_nodes;

CREATE POLICY "Public insert" ON music_nodes FOR INSERT WITH CHECK (
  char_length(song_title) BETWEEN 1 AND 500 AND
  char_length(artist)     BETWEEN 1 AND 500 AND
  (genre       IS NULL OR char_length(genre)       <= 100) AND
  (album_art   IS NULL OR char_length(album_art)   <= 500) AND
  (itunes_url  IS NULL OR char_length(itunes_url)  <= 500) AND
  (preview_url IS NULL OR char_length(preview_url) <= 500)
);
