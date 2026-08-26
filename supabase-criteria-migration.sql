-- Persist the per-criterion breakdown and mood that Claude already returns
-- but which were previously discarded. Run once in the Supabase SQL editor.

alter table public.ai_analysis
  add column if not exists criteria      jsonb,
  add column if not exists manager_mood  text,
  add column if not exists client_mood   text;

-- criteria shape: { "greeting": 0-100, "needs_discovery": 0-100,
--   "presentation": 0-100, "objection_handling": 0-100, "closing": 0-100 }
