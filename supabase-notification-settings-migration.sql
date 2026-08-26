-- Settings → Сповіщення persisted to browser localStorage before — same bug as
-- Профіль: another admin, or the same admin on a new device, never saw the real
-- saved notification preferences.
alter table managers add column if not exists notification_settings jsonb;
