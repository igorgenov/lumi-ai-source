-- Auto-archiving inactive contragents (10+ робочих днів без нового дзвінка/зустрічі/чату).
alter table contragents add column if not exists is_archived boolean not null default false;
alter table contragents add column if not exists archived_at timestamptz;
create index if not exists contragents_is_archived_idx on contragents (is_archived);
