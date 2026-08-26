-- "chat_insights" now applies to calls and meetings too, not just chats — rename to a
-- generic name. No data loss: existing chat rows keep their values under the new name.
alter table ai_analysis rename column chat_insights to insights;
