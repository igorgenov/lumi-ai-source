-- Adds a single jsonb column to hold the structured "Block 6" chat insights
-- (client pain point, objections, next steps, conversion probability) that the
-- active chat prompt already asks for but the code previously had no field to
-- store them in.
alter table ai_analysis add column if not exists chat_insights jsonb;
