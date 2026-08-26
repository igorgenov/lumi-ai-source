-- Snapshot of an ai_analysis row taken right before it gets overwritten by a
-- re-analysis — Telegram chats get re-analyzed weekly (see backend/app/routers/chats.py
-- poll_chats), and without this the previous week's score/summary/insights is just
-- gone, making it impossible to see how a chat's trajectory changed over time or to
-- explain a coaching decision made off an earlier snapshot.
create table if not exists ai_analysis_history (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  score int,
  summary text,
  client_mood text,
  manager_mood text,
  insights jsonb,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_analysis_history_conversation on ai_analysis_history(conversation_id, analyzed_at desc);
