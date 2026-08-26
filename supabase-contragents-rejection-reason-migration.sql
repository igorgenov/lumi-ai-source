-- Stores the AI-derived "true rejection reason" for a contragent — computed on demand
-- from the FULL funnel (every call/meeting/chat combined), not just the single
-- possibly-inaccurate Planfix field a manager fills in. See project notes: managers
-- often mistype or guess this field, and the client's stated reason to the manager can
-- differ from what actually happened across the whole conversation history.
alter table contragents add column if not exists true_rejection_reason jsonb;
alter table contragents add column if not exists true_rejection_reason_computed_at timestamptz;
