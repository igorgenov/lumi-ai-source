-- Talk/listen ratio: % of the conversation each side spoke, computed purely from
-- transcript timestamps (VTT for calls, AssemblyAI utterances for meetings) — never
-- sent to Claude, so it cannot influence score/criteria. Purely informational.
-- Run once in the Supabase SQL editor.

alter table public.conversations add column if not exists speaker_talk_seconds jsonb;
alter table public.conversations add column if not exists manager_talk_pct integer;

-- Tagged transcript moments (e.g. #Заперечення_Ціна) — additional annotation on top of
-- the existing analysis, never part of score/criteria.
alter table public.ai_analysis add column if not exists tagged_moments jsonb;
