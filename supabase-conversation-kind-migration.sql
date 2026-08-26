-- Classifies WHY a call/meeting happened (Брифування, Презентація КП, Крос-продаж,
-- Фідбек/follow-up, Знайомство, Скарга, Технічне уточнення, Інше) — independent of
-- WHICH Inweb service (SEO/PPC/GEO/...) was discussed, which stays in `service`.
alter table conversations add column if not exists conversation_kind text;
