-- Mirror of sm_reason_category/sm_reason_comment, but for WON deals — SM manually fills
-- "Чому клієнт обрав Inweb?" (field 2431) and "Кого розглядають серед конкурентів"
-- (field 2441) in Planfix, shown side-by-side with the independent AI conclusion for a
-- human to compare, same design principle as the loss-reason SM fields.
alter table contragent_deals add column if not exists sm_win_reason text;
alter table contragent_deals add column if not exists sm_competitors text;
