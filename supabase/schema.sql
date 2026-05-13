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
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_nodes_parent ON music_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_music_nodes_depth  ON music_nodes(depth);

-- Allow public read + insert (no auth required)
ALTER TABLE music_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"   ON music_nodes FOR SELECT USING (true);
CREATE POLICY "Public insert" ON music_nodes FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE music_nodes;
