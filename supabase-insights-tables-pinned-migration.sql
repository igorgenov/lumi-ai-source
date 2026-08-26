alter table insights add column if not exists table_data jsonb;
alter table insights add column if not exists pinned boolean default false;
alter table insights add column if not exists computed_stats jsonb;
