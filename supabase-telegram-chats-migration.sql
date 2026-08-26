-- Telegram chat-analysis pipeline (Planfix-synced client correspondence).
alter table conversations add column if not exists planfix_task_id bigint unique;
alter table conversations add column if not exists planfix_last_comment_at timestamptz;

-- Planfix accounts use "working nicknames" that don't match Lumi AI's manager names
-- (Cyrillic/Latin, nicknames in the middle) — mapped once by hand instead of guessed.
create table if not exists planfix_manager_map (
  planfix_user_id text primary key,
  manager_id uuid not null references managers(id),
  created_at timestamptz not null default now()
);

insert into planfix_manager_map (planfix_user_id, manager_id)
select v.planfix_user_id, m.id
from (values
  ('32',  'Aibis Naumov'),
  ('123', 'Alexey Mamontov'),
  ('101', 'Alina Glazyrina'),
  ('240', 'Anastasiya Grechko'),
  ('43',  'Igor Muterko'),
  ('213', 'Maksim Belonozhko'),
  ('167', 'Serhii Cherdintsev'),
  ('471', 'Taras Narepekha'),
  ('241', 'Tatiana Tymtsunyk'),
  ('49',  'Tatyana Avksentieva'),
  ('124', 'Vadim Badiuk'),
  ('199', 'Vladyslav Baadzhy'),
  ('70',  'Yuliya Zalihovskaya')
) as v(planfix_user_id, manager_name)
join managers m on m.name = v.manager_name
on conflict (planfix_user_id) do nothing;

-- Single-row config: sync stays off until explicitly enabled, and even then only
-- messages from since_date forward are ever considered (mirrors meeting_sources'
-- since_date — never bulk-backfill years of chat history).
create table if not exists chat_sync_settings (
  id int primary key default 1,
  enabled boolean not null default false,
  since_date timestamptz not null default now(),
  constraint chat_sync_settings_singleton check (id = 1)
);
insert into chat_sync_settings (id, enabled, since_date) values (1, false, now())
  on conflict (id) do nothing;
