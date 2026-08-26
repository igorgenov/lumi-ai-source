-- Deals (Planfix tasks) manually linked to a contragent — a contragent can have
-- several (one per service, e.g. PPC won + SEO lost), so this is its own table rather
-- than a single field on contragents. Added by hand (task ID from the Planfix URL);
-- status is then refreshed automatically once a day by the deals-refresh cron, until
-- is_final becomes true (Planfix status.isActive === false — deal closed either way),
-- at which point the daily check stops for that specific deal.
create table if not exists contragent_deals (
  id uuid primary key default gen_random_uuid(),
  contragent_id uuid not null references contragents(id) on delete cascade,
  planfix_task_id bigint not null,
  task_name text,
  service text,
  status_id int,
  status_name text,
  status_color text,
  is_final boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contragent_id, planfix_task_id)
);
create index if not exists idx_contragent_deals_contragent on contragent_deals(contragent_id);
create index if not exists idx_contragent_deals_active on contragent_deals(is_final) where is_final = false;
