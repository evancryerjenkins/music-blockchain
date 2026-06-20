-- Chat messages schema
-- Run this in the Supabase SQL editor after schema.sql

CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users,
  display_name TEXT NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Only authenticated users may read
CREATE POLICY "Authenticated read" ON chat_messages FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only authenticated users may insert their own messages, with field limits
CREATE POLICY "Authenticated insert" ON chat_messages FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND
  auth.uid() = user_id AND
  char_length(message) BETWEEN 1 AND 500 AND
  char_length(display_name) BETWEEN 1 AND 100
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
