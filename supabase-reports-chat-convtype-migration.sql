-- Allow "chat" (Telegram-чати) as a valid conv_type for scheduled_reports,
-- alongside the existing 'all','call','meeting'.
alter table scheduled_reports drop constraint if exists scheduled_reports_conv_type_check;
alter table scheduled_reports add constraint scheduled_reports_conv_type_check
  check (conv_type in ('all','call','meeting','chat'));
