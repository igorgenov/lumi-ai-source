alter table coaching_sessions
  add column if not exists status text not null default 'planned';

alter table coaching_sessions
  drop constraint if exists coaching_sessions_status_check;

alter table coaching_sessions
  add constraint coaching_sessions_status_check check (status in ('planned', 'in_progress', 'completed'));
