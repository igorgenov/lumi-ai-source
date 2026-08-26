-- Report channels (Telegram credentials)
create table if not exists report_channels (
  id          text primary key default 'default',
  telegram_token    text not null default '',
  telegram_chat_id  text not null default '',
  telegram_chat_name text not null default '',
  updated_at  timestamptz default now()
);

insert into report_channels (id) values ('default') on conflict do nothing;

-- Scheduled reports config
create table if not exists scheduled_reports (
  id           text primary key,
  name         text not null,
  frequency    text not null check (frequency in ('daily','weekly','monthly')),
  day_of_week  text,
  day_of_month integer,
  time         text not null default '09:00',
  channels     jsonb not null default '{"email":false,"telegram":true}',
  content      jsonb not null default '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":false,"aiRecommendations":false}',
  active       boolean not null default true,
  created_at   timestamptz default now()
);

-- Seed default reports if table is empty
insert into scheduled_reports (id, name, frequency, day_of_week, time, channels, content, active)
values
  ('r1', 'Щотижневий звіт команди', 'weekly', 'Пн', '09:00',
   '{"email":false,"telegram":true}',
   '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":false,"aiRecommendations":false}',
   true),
  ('r2', 'Місячний підсумок', 'monthly', null, '10:00',
   '{"email":false,"telegram":true}',
   '{"aiScore":true,"callCount":true,"conversion":true,"topManagers":true,"lowScoreManagers":true,"aiRecommendations":true}',
   false)
on conflict do nothing;
