-- Adds the generic "blocks" composition model to insights, replacing the fixed
-- chart_data/table_data shape (kept in place for old rows — the app renders both).
alter table insights add column if not exists blocks jsonb default '[]'::jsonb;
alter table insights add column if not exists title text;
