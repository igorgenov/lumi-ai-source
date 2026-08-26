-- Контрагенти: єдина картка клієнта, що об'єднує дзвінки/зустрічі/чати за телефоном або доменом.
-- Best-effort matching — не всі розмови вдасться прив'язати (немає домену/телефону), це нормально.
create table if not exists contragents (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  domain text,
  planfix_contact_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contragents_phone_idx on contragents (phone) where phone is not null;
create index if not exists contragents_domain_idx on contragents (domain) where domain is not null;

alter table conversations add column if not exists contragent_id uuid references contragents(id);
create index if not exists conversations_contragent_id_idx on conversations (contragent_id) where contragent_id is not null;
