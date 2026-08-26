-- AI-synthesized loss reason per lost deal (Аннєнік's request, серпень 2026): combines
-- SM-side conversations (brief/КП presentation/correspondence) with CrazyLady's CSM
-- feedback survey call (conversation_kind = "Фідбек CSM") into one detailed conclusion +
-- confidence score. kp_link mirrors Planfix custom field 387 ("КП") — non-empty is the
-- proxy for "deal reached КП stage" (Planfix has no direct funnel-stage-history API).
-- is_complex_case flags contragents with multiple overlapping/simultaneous deals, where
-- automatically attributing conversations to one specific deal would be a guess — per
-- Аннєнік's own note, these stay manual for now instead of a silent wrong attribution.
alter table contragent_deals add column if not exists kp_link text;
alter table contragent_deals add column if not exists lost_at timestamptz;
alter table contragent_deals add column if not exists ai_loss_reason jsonb;
alter table contragent_deals add column if not exists ai_loss_reason_computed_at timestamptz;
alter table contragent_deals add column if not exists is_complex_case boolean not null default false;

create index if not exists idx_contragent_deals_loss_pending
  on contragent_deals(status_name)
  where is_final = true and ai_loss_reason is null;
