-- Real billed Claude API costs imported from the Anthropic Console cost dashboard
-- (platform.claude.com/cost), as a ground-truth check against our own per-call
-- token-based cost estimates in ai_analysis/insights/report_costs.
create table if not exists anthropic_actual_costs (
  id bigint generated always as identity primary key,
  usage_date date not null,
  model text not null,
  cost_usd numeric not null,
  created_at timestamptz not null default now(),
  unique (usage_date, model)
);
