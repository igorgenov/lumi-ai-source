-- For meeting transcripts labeled "Спікер A", "Спікер B" etc (multi-participant
-- Meet recordings), Claude identifies who's who so the transcript can show real
-- names/roles instead of raw speaker letters.
-- Run once in the Supabase SQL editor.

alter table public.ai_analysis
  add column if not exists speaker_labels jsonb;
