-- Real billed AssemblyAI costs imported from the account usage dashboard, for days
-- where the duration-based estimate in the costs page undercounts real spend
-- (failed/retried transcriptions during background-task interruptions never save a
-- final duration_seconds, but AssemblyAI still bills for the attempt).
create table if not exists assemblyai_actual_costs (
  id bigint generated always as identity primary key,
  usage_date date not null unique,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);
