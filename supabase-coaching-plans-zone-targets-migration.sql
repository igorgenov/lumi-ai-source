-- Development plans move from a single "target_score" number to three zone-share
-- targets (% of scored conversations that should land red/yellow/green) — the same
-- three-zone model already used everywhere else (Dashboard, Менеджери, Розмови).
alter table coaching_plans add column if not exists target_green_pct int;
alter table coaching_plans add column if not exists target_yellow_pct int;
alter table coaching_plans add column if not exists target_red_pct int;
