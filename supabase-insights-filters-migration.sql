alter table insights add column if not exists services text[] default '{}'::text[];
alter table insights add column if not exists kinds text[] default '{}'::text[];
