-- Settings → Профіль only persisted to browser localStorage before, so another
-- admin (or the same admin on a new device) never saw the real saved phone number,
-- and "position" synced to the DB but was still displayed from stale localStorage.
alter table managers add column if not exists phone text;
