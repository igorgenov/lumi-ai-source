-- Run this in Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS prompts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  text         TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (access controlled via service role key in API routes)
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (our API routes use service role)
CREATE POLICY "service_role_all" ON prompts
  USING (true)
  WITH CHECK (true);
