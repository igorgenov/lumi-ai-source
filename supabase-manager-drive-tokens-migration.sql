-- Per-manager Google Drive OAuth tokens — each manager self-authorizes read access to
-- their own Drive with one click (standard consent, no Workspace Super Admin needed),
-- instead of relying on the single shared polling account whose folder access breaks
-- every time Google rotates the "Google Meet" root folder.
create table if not exists manager_drive_tokens (
  manager_id uuid primary key references managers(id) on delete cascade,
  refresh_token text not null,
  google_email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
