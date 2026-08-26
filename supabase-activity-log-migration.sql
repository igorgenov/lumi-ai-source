-- General admin-action audit trail (prompt deletions, Google Drive folder changes,
-- manual службу/тип corrections, manual reanalyze triggers) — complements
-- access_audit_log (role changes) and prompt_versions (prompt content edits) in the
-- combined "Журнал змін" view.
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  kind text not null,
  summary text not null,
  href text,
  performed_by text,
  created_at timestamptz not null default now()
);
