-- Mirror of ai_loss_reason/ai_loss_reason_computed_at, but for WON deals — "чому клієнт
-- обрав нас" instead of "чому пішов". Kept as separate columns (not reused) since a
-- deal is either won or lost, and future views may want to show both loss- and
-- win-reason review side by side without ambiguity about which outcome a value refers to.
alter table contragent_deals add column if not exists ai_win_reason jsonb;
alter table contragent_deals add column if not exists ai_win_reason_computed_at timestamptz;
alter table contragent_deals add column if not exists won_at timestamptz;
