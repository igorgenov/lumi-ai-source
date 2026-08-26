-- Adds support for a contragent having more than one known website/subdomain
-- (e.g. a main site + a separate shop subdomain) — a dedicated table instead of
-- a single `domain` column, so automatic matching can recognize either one.
create table if not exists contragent_domain_aliases (
  id uuid primary key default gen_random_uuid(),
  contragent_id uuid not null references contragents(id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),
  unique (contragent_id, domain)
);

create index if not exists contragent_domain_aliases_domain_idx on contragent_domain_aliases (domain);
