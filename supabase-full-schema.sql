-- ============================================================
-- Lumi AI — Full Database Schema for Supabase
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 1. BASE TABLES (no CREATE TABLE in migrations)
-- ============================================================

-- 1.1 managers
CREATE TABLE IF NOT EXISTS managers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  email               TEXT UNIQUE,
  role                TEXT NOT NULL DEFAULT 'viewer',
  position            TEXT,
  avatar_url          TEXT,
  phone               TEXT,
  notification_settings JSONB,
  last_active_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 conversations
CREATE TABLE IF NOT EXISTS conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id          UUID REFERENCES managers(id) ON DELETE SET NULL,
  type                TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'chat')),
  status              TEXT NOT NULL DEFAULT 'pending',
  date                TIMESTAMPTZ,
  client_name         TEXT,
  client_company      TEXT,
  transcript          TEXT,
  service             TEXT,
  duration_seconds    INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- PM pivot columns
  project_id          TEXT,
  project_name        TEXT,
  project_phase       TEXT,
  deadline_status     TEXT,
  budget_status       TEXT,
  -- Meeting pipeline
  google_drive_file_id TEXT UNIQUE,
  -- Chat pipeline
  conversation_kind   TEXT,
  planfix_task_id     BIGINT UNIQUE,
  planfix_last_comment_at TIMESTAMPTZ,
  -- Talk ratio
  speaker_talk_seconds JSONB,
  manager_talk_pct    INTEGER
);

-- 1.3 ai_analysis
CREATE TABLE IF NOT EXISTS ai_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  score               INTEGER,
  summary             TEXT,
  strengths           JSONB,
  weaknesses          JSONB,
  recommendations     JSONB,
  analyzed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Criteria breakdown
  criteria            JSONB,
  manager_mood        TEXT,
  client_mood         TEXT,
  -- Cost tracking
  cost_usd            NUMERIC,
  -- Chat/call insights
  insights            JSONB,
  -- Explanations
  criteria_explanations JSONB,
  -- Speaker labels for multi-participant meetings
  speaker_labels      JSONB,
  -- Tagged transcript moments
  tagged_moments      JSONB
);

-- 1.4 insights
CREATE TABLE IF NOT EXISTS insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question            TEXT,
  summary             TEXT,
  key_findings        JSONB,
  recommendations     JSONB,
  by_manager          JSONB,
  quotes              JSONB,
  analyzed_count      INTEGER,
  date_from           TEXT,
  date_to             TEXT,
  type                TEXT,
  manager_ids         JSONB,
  data_source         TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cost
  cost_usd            NUMERIC,
  -- Chart/table data
  chart_data          JSONB,
  table_data          JSONB,
  pinned              BOOLEAN DEFAULT FALSE,
  computed_stats      JSONB,
  -- Blocks composition
  blocks              JSONB DEFAULT '[]'::JSONB,
  title               TEXT,
  -- Filters
  services            TEXT[] DEFAULT '{}'::TEXT[],
  kinds               TEXT[] DEFAULT '{}'::TEXT[]
);

-- 1.5 coaching_plans
CREATE TABLE IF NOT EXISTS coaching_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id          UUID UNIQUE REFERENCES managers(id) ON DELETE CASCADE,
  goal                TEXT,
  deadline            TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_green_pct    INTEGER,
  target_yellow_pct   INTEGER,
  target_red_pct      INTEGER
);

-- 1.6 coaching_sessions
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id          UUID REFERENCES managers(id) ON DELETE CASCADE,
  date                DATE,
  notes               TEXT,
  homework            TEXT,
  next_session        DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed'))
);

-- ============================================================
-- 2. TABLES FROM MIGRATIONS
-- ============================================================

-- 2.1 projects (PM pivot)
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 prompts
CREATE TABLE IF NOT EXISTS prompts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  text              TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  usage_count       INTEGER NOT NULL DEFAULT 0,
  conversation_type TEXT,
  manager_roles     JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON prompts USING (true) WITH CHECK (true);

-- 2.3 prompt_versions
CREATE TABLE IF NOT EXISTS prompt_versions (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prompt_id         UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  text              TEXT NOT NULL,
  conversation_type TEXT,
  manager_roles     JSONB,
  edited_by         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prompt_versions_prompt_id_idx ON prompt_versions(prompt_id);

-- 2.4 contragents
CREATE TABLE IF NOT EXISTS contragents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  phone         TEXT,
  domain        TEXT,
  planfix_contact_id BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at   TIMESTAMPTZ,
  true_rejection_reason JSONB,
  true_rejection_reason_computed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS contragents_phone_idx ON contragents (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS contragents_domain_idx ON contragents (domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS contragents_is_archived_idx ON contragents (is_archived);

-- 2.5 meeting_sources
CREATE TABLE IF NOT EXISTS meeting_sources (
  folder_id   TEXT PRIMARY KEY,
  manager_id  UUID NOT NULL REFERENCES managers(id),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  since_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE meeting_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON meeting_sources USING (true) WITH CHECK (true);

-- 2.6 manager_drive_tokens
CREATE TABLE IF NOT EXISTS manager_drive_tokens (
  manager_id    UUID PRIMARY KEY REFERENCES managers(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  google_email  TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 planfix_manager_map
CREATE TABLE IF NOT EXISTS planfix_manager_map (
  planfix_user_id TEXT PRIMARY KEY,
  manager_id      UUID NOT NULL REFERENCES managers(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8 chat_sync_settings (singleton)
CREATE TABLE IF NOT EXISTS chat_sync_settings (
  id        INT PRIMARY KEY DEFAULT 1,
  enabled   BOOLEAN NOT NULL DEFAULT false,
  since_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_sync_settings_singleton CHECK (id = 1)
);
INSERT INTO chat_sync_settings (id, enabled, since_date)
VALUES (1, FALSE, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2.9 ai_cost_log
CREATE TABLE IF NOT EXISTS ai_cost_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  cost_usd        NUMERIC NOT NULL DEFAULT 0,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_cost_log_created_at_idx ON ai_cost_log(created_at);

-- 2.10 ai_analysis_history
CREATE TABLE IF NOT EXISTS ai_analysis_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  score           INTEGER,
  summary         TEXT,
  client_mood     TEXT,
  manager_mood    TEXT,
  insights        JSONB,
  strengths       JSONB,
  weaknesses      JSONB,
  criteria        JSONB,
  analyzed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_history_conversation
  ON ai_analysis_history(conversation_id, analyzed_at DESC);

-- 2.11 report_channels
CREATE TABLE IF NOT EXISTS report_channels (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  telegram_token   TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT NOT NULL DEFAULT '',
  telegram_chat_name TEXT NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO report_channels (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- 2.12 scheduled_reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week  TEXT,
  day_of_month INTEGER,
  time         TEXT NOT NULL DEFAULT '09:00',
  channels     JSONB NOT NULL DEFAULT '{"email":false,"telegram":true}',
  content      JSONB NOT NULL DEFAULT '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":false,"aiRecommendations":false}',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  manager_ids  JSONB NOT NULL DEFAULT '[]',
  conv_type    TEXT NOT NULL DEFAULT 'all'
    CHECK (conv_type IN ('all','call','meeting','chat'))
);

-- 2.13 report_costs
CREATE TABLE IF NOT EXISTS report_costs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cost_usd   NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.14 anthropic_actual_costs
CREATE TABLE IF NOT EXISTS anthropic_actual_costs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usage_date DATE NOT NULL,
  model      TEXT NOT NULL,
  cost_usd   NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usage_date, model)
);

-- 2.15 assemblyai_actual_costs
CREATE TABLE IF NOT EXISTS assemblyai_actual_costs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usage_date DATE NOT NULL UNIQUE,
  cost_usd   NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.16 activity_log
CREATE TABLE IF NOT EXISTS activity_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  href         TEXT,
  performed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.17 access_audit_log
CREATE TABLE IF NOT EXISTS access_audit_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action        TEXT NOT NULL,
  target_email  TEXT,
  target_name   TEXT,
  before_role   TEXT,
  after_role    TEXT,
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_project_name ON conversations(project_name);
CREATE INDEX IF NOT EXISTS idx_conversations_deadline_status ON conversations(deadline_status);

-- ============================================================
-- 4. SEED DATA
-- ============================================================

-- Seed scheduled reports
INSERT INTO scheduled_reports (id, name, frequency, day_of_week, time, channels, content, active)
VALUES
  ('r1', 'Щотижневий звіт команди', 'weekly', 'Пн', '09:00',
   '{"email":false,"telegram":true}',
   '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":false,"aiRecommendations":false}',
   true),
  ('r2', 'Місячний підсумок', 'monthly', NULL, '10:00',
   '{"email":false,"telegram":true}',
   '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":true,"aiRecommendations":true}',
   false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. DONE!
-- ============================================================
-- After running this, you should see 25 tables in your Supabase project.
-- Next steps:
--   1. Add your first PM user in the `managers` table
--   2. Configure API keys in Vercel/Render
--   3. Test Google OAuth login
