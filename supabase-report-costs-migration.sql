create table if not exists report_costs (
  id bigint generated always as identity primary key,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);
