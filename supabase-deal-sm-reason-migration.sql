-- SM's own manually-picked Planfix reason (fields 1667/1669), fetched purely for
-- side-by-side DISPLAY next to Lumi's independent AI loss-reason conclusion — never fed
-- into the AI prompt (see backend/app/services/loss_reason.py design note), so the AI's
-- independent read of the conversations isn't anchored on what the manager already
-- believed happened.
alter table contragent_deals add column if not exists sm_reason_category text;
alter table contragent_deals add column if not exists sm_reason_comment text;
