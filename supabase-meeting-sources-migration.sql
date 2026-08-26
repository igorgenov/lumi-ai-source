-- Per-manager Google Drive folder settings for the meetings pipeline:
-- lets an admin enable/disable ingestion per manager and set a cutoff date
-- so we never bulk-transcribe years of historical recordings.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS meeting_sources (
  folder_id   TEXT PRIMARY KEY,
  manager_id  UUID NOT NULL REFERENCES managers(id),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  since_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE meeting_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON meeting_sources
  USING (true)
  WITH CHECK (true);

-- Seed the 3 known manager folders, disabled by default until an admin
-- explicitly turns each one on (and confirms the "since" cutoff) in Налаштування → Інтеграції.
INSERT INTO meeting_sources (folder_id, manager_id, enabled, since_date) VALUES
  ('1DyAPQjzumm5bns__6yLOYhicqDtgtZo_', '66b91981-6047-4b2f-941d-3403a3096bf7', false, NOW()),
  ('1j4RoKSnz0bN1qSi67qVSerADrtIfYCxW', 'ac157d23-9a17-4ee3-b9d0-16eff068e1ae', false, NOW()),
  ('1oH2b9cRlPfcRaSBvFAd3geI_c-hT9_wj', '995b4928-ba70-4f4b-989c-7e7718b1e610', false, NOW())
ON CONFLICT (folder_id) DO NOTHING;
