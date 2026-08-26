-- Widen ai_analysis_history so a past snapshot can be expanded to show its full
-- strengths/weaknesses/criteria, not just the one-line summary — needed to make the
-- "Історія аналізів" section on the conversation card actually useful to click into.
alter table ai_analysis_history add column if not exists strengths jsonb;
alter table ai_analysis_history add column if not exists weaknesses jsonb;
alter table ai_analysis_history add column if not exists criteria jsonb;
