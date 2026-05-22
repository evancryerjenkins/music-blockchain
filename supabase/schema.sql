-- Music Blockchain schema
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS music_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES music_nodes(id) ON DELETE CASCADE,
  song_title  TEXT NOT NULL,
  artist      TEXT NOT NULL,
  genre       TEXT,
  year        INTEGER,
  album_art   TEXT,
  itunes_url  TEXT,
  preview_url TEXT,
  depth       INTEGER NOT NULL DEFAULT 0,
  added_by      TEXT,
  session_token TEXT,
  spotify_uri   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_nodes_parent ON music_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_music_nodes_depth  ON music_nodes(depth);

-- Prevent the same song being added twice under the same parent
CREATE UNIQUE INDEX IF NOT EXISTS idx_music_nodes_unique_child
  ON music_nodes (parent_id, lower(song_title), lower(artist))
  WHERE parent_id IS NOT NULL;

-- Allow public read + insert (no auth required)
ALTER TABLE music_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON music_nodes FOR SELECT USING (true);

-- Enforce field length limits at the DB layer
CREATE POLICY "Public insert" ON music_nodes FOR INSERT WITH CHECK (
  char_length(song_title) BETWEEN 1 AND 500 AND
  char_length(artist)     BETWEEN 1 AND 500 AND
  (genre       IS NULL OR char_length(genre)       <= 100) AND
  (album_art   IS NULL OR char_length(album_art)   <= 500) AND
  (itunes_url  IS NULL OR char_length(itunes_url)  <= 500) AND
  (preview_url IS NULL OR char_length(preview_url) <= 500) AND
  (added_by    IS NULL OR char_length(added_by)    <= 100)
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE music_nodes;
