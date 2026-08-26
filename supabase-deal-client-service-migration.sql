-- Granular "Послуга для клієнта" label from Planfix (field 443) — e.g. "SEO — переїзд
-- сайту" vs "SEO на етапі розробки". Two deals for the same contragent can share the
-- coarse `service` (SEO/PPC/etc, guessed from the task name) while being genuinely
-- different projects; this field is what lets a human tell them apart on the Угоди tab.
alter table contragent_deals add column if not exists client_service_label text;
