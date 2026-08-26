-- Support the meetings pipeline: dedupe Drive recordings across polls.
-- Run once in the Supabase SQL editor.

alter table public.conversations
  add column if not exists google_drive_file_id text unique;
