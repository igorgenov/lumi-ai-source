-- conversations.type had a check constraint allowing only 'call'/'meeting' — widen it
-- to also allow 'chat' (Telegram correspondence synced from Planfix).
alter table conversations drop constraint if exists conversations_type_check;
alter table conversations add constraint conversations_type_check check (type in ('call', 'meeting', 'chat'));
