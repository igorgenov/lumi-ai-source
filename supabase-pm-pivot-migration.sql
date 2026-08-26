-- ============================================================
-- PM Pivot Migration: Remove SM-specific data, add PM columns
-- ============================================================

-- 1. Remove SM-specific columns from conversations
ALTER TABLE conversations 
  DROP COLUMN IF EXISTS ringostat_call_id,
  DROP COLUMN IF EXISTS call_status,
  DROP COLUMN IF EXISTS call_direction,
  DROP COLUMN IF EXISTS audio_url,
  DROP COLUMN IF EXISTS vtt_url;

-- 2. Add PM-specific columns to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_phase TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deadline_status TEXT; -- on_track/at_risk/delayed
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS budget_status TEXT; -- on_track/over_budget/under_budget

-- 3. Create indexes for PM queries
CREATE INDEX IF NOT EXISTS idx_conversations_project_name ON conversations(project_name);
CREATE INDEX IF NOT EXISTS idx_conversations_deadline_status ON conversations(deadline_status);

-- 4. Drop SM-specific tables
DROP TABLE IF EXISTS contragent_deals CASCADE;
DROP TABLE IF EXISTS contragent_domain_aliases CASCADE;
DROP TABLE IF EXISTS contragent_rejection_reasons CASCADE;
DROP TABLE IF EXISTS contragents_archive CASCADE;

-- 5. Clean up prompts table - remove SM-specific prompts
DELETE FROM prompts WHERE name LIKE '%SM%' OR name LIKE '%LQS%' OR name LIKE '%ENIQ%' OR name LIKE '%销售%';

-- 6. Update conversation_kind to use PM-specific values
-- (Existing data will keep old values, new conversations will use PM kinds)

-- 7. Add PM-specific conversation kinds (for reference)
-- Possible PM conversation_kind values:
-- - Статус-зустріч
-- - Планування спринту
-- - Ретроспектива
-- - Демо/Презентація
-- - Технічне обговорення
-- - Інше

-- 8. Create projects table for PM
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- active/paused/completed/archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Add project_id foreign key to conversations (if needed)
-- ALTER TABLE conversations ADD CONSTRAINT fk_project 
--   FOREIGN KEY (project_id) REFERENCES projects(id);

-- 10. Update manager roles in managers table
-- (Run manually for existing users)
-- UPDATE managers SET role = 'pm' WHERE role = 'manager';
