-- Tracks the last time a manager was actually active in Lumi AI (throttled update on
-- session check, not just login — a JWT session can persist for weeks without a fresh
-- sign-in). Powers the "давно не заходив" badge on the Менеджери page.
-- Run once in the Supabase SQL editor.

alter table public.managers add column if not exists last_active_at timestamptz;
