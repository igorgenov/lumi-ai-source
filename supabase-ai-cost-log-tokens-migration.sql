-- Raw token counts alongside the already-computed cost_usd — added so a future
-- discrepancy between our computed cost and Anthropic's real billed amount (found
-- 2026-07-27: $0.53 computed vs $0.88 actually billed for the same 5 conversations,
-- cause not identified) can be diagnosed token-for-token against Anthropic's own
-- usage report, instead of guessing at which pricing tier/rate applies.
alter table ai_cost_log add column if not exists input_tokens int;
alter table ai_cost_log add column if not exists output_tokens int;
