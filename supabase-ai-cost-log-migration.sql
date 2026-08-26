-- Append-only log of every AI-analysis run (first analysis AND every "Повторний
-- аналіз") — unlike ai_analysis (which gets deleted+reinserted on every re-run, so its
-- cost_usd only ever reflects the LATEST run), this table keeps every run's real cost
-- so total spend on the "Витрати на AI" page is never silently lost on re-analysis.
create table if not exists ai_cost_log (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_cost_log_created_at_idx on ai_cost_log(created_at);

-- One-time backfill: seed the log with whatever cost_usd is CURRENTLY on ai_analysis,
-- so the "Витрати на AI" totals don't visibly drop the moment this table starts being
-- used — this can only capture the latest run's cost per conversation (money spent on
-- earlier re-analyses before this table existed is genuinely gone, not recoverable).
insert into ai_cost_log (conversation_id, cost_usd, created_at)
select conversation_id, cost_usd, created_at
from ai_analysis
where cost_usd is not null and cost_usd > 0;
