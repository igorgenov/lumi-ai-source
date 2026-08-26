-- Who granted/changed someone's role, or added/removed a user — currently invisible
-- anywhere in the app. Paired with prompt_versions (from the prompt-history feature)
-- this covers both halves of "who changed what and when" for admin actions.
create table if not exists access_audit_log (
  id bigint generated always as identity primary key,
  action text not null, -- 'created' | 'role_changed' | 'deleted'
  target_email text,
  target_name text,
  before_role text,
  after_role text,
  performed_by text,
  created_at timestamptz not null default now()
);
