-- Snapshot of a prompt's state right before each edit, so a bad criteria change
-- can be reverted instead of guessing what the previous wording was.
create table if not exists prompt_versions (
  id bigint generated always as identity primary key,
  prompt_id uuid not null references prompts(id) on delete cascade,
  name text not null,
  description text,
  text text not null,
  conversation_type text,
  manager_roles jsonb,
  edited_by text,
  created_at timestamptz not null default now()
);
create index if not exists prompt_versions_prompt_id_idx on prompt_versions(prompt_id);
