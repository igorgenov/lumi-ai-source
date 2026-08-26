-- Add manager_ids and conv_type to scheduled_reports
alter table scheduled_reports
  add column if not exists manager_ids jsonb not null default '[]',
  add column if not exists conv_type   text not null default 'all' check (conv_type in ('all','call','meeting'));
