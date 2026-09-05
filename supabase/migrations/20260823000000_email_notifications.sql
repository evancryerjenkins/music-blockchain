-- Email notification preferences migration
-- Safe to run against an existing database; all operations are idempotent.
-- Run this in the Supabase SQL editor.

-- Opt-in only: a user receives nothing until they flip the toggle, which
-- inserts their row with email_on_new_node = true.
CREATE TABLE IF NOT EXISTS notify_prefs (
  user_id           UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email             TEXT NOT NULL,
  email_on_new_node BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup for the unsubscribe link, which arrives with no session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notify_prefs_unsub
  ON notify_prefs(unsubscribe_token);

-- The send path only ever reads opted-in rows.
CREATE INDEX IF NOT EXISTS idx_notify_prefs_optedin
  ON notify_prefs(user_id) WHERE email_on_new_node;

ALTER TABLE notify_prefs ENABLE ROW LEVEL SECURITY;

-- Users may read and change only their own row. Both the send path and the
-- unsubscribe path use the service role key, which bypasses RLS.
DROP POLICY IF EXISTS "Own prefs select" ON notify_prefs;
CREATE POLICY "Own prefs select" ON notify_prefs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own prefs insert" ON notify_prefs;
CREATE POLICY "Own prefs insert" ON notify_prefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own prefs update" ON notify_prefs;
CREATE POLICY "Own prefs update" ON notify_prefs
  FOR UPDATE USING (auth.uid() = user_id);
