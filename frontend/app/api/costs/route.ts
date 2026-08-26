import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// AssemblyAI charges per audio-hour transcribed (meetings only) — no per-request usage
// data is available to us like with Claude, so this is an estimate, not an exact figure.
// Rate derived from actual account usage (AssemblyAI dashboard: $2.09 spent / 12.3 hours),
// which already reflects the real combination in use — Pre-recorded Universal-2 ($0.15/hr
// base) plus the Speaker Diarization add-on — rather than guessing from a single published
// line item.
const ASSEMBLYAI_RATE_PER_HOUR = 0.17;

function pad2(n: number) { return String(n).padStart(2, "0"); }
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(week)}`;
}
function monthKey(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function dayKey(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function prevWeekKey(key: string): string {
  const [y, w] = key.split("-W").map(Number);
  // Approximate the previous ISO week by stepping back 7 days from that week's Thursday.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7 - 7);
  return isoWeekKey(monday);
}
function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return monthKey(d);
}

type Bucket = { analysis: number; insights: number; transcription: number; reports: number };
const empty = (): Bucket => ({ analysis: 0, insights: 0, transcription: 0, reports: 0 });
const total = (b: Bucket) => b.analysis + b.insights + b.transcription + b.reports;

export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();

  // Analysis cost (calls + meetings + chats) — from the append-only ai_cost_log, which
  // (unlike ai_analysis.cost_usd) keeps every analysis run's real cost, including every
  // "Повторний аналіз" re-run, instead of only the latest one. Tiered select so a
  // pending migration never 500s this page.
  //
  // Bucketed by ai_cost_log.created_at (when the Claude call actually happened / money
  // was actually spent), NOT conversations.date (when the call/meeting/chat message
  // itself happened) — those used to be the same column, which barely mattered for
  // calls/meetings (analyzed same-day) but broke badly for chats: a chat re-analyzed
  // weekly, or backfilled weeks of history on first sync, would attribute today's real
  // spend to whatever old date its last message happened to be, making "today"/"this
  // week" look like nothing was spent even right after a real analysis run (caught live
  // 2026-08-14 rolling out the Telegram-chat poll — a real bill that day showed as $0).
  let analysisRows: { cost_usd: number | null; created_at: string | null; conversations: { date: string; type: string } | { date: string; type: string }[] | null }[] = [];
  {
    const { data, error } = await db
      .from("ai_cost_log")
      .select("cost_usd, created_at, conversations!inner(date, type)");
    if (!error) analysisRows = (data ?? []) as any;
  }

  // Meeting durations, for the AssemblyAI transcription cost estimate.
  const { data: meetingRows } = await db
    .from("conversations")
    .select("date, duration_seconds")
    .eq("type", "meeting");

  // Insights query cost.
  let insightRows: { cost_usd: number | null; created_at: string }[] = [];
  {
    const { data, error } = await db.from("insights").select("cost_usd, created_at");
    if (!error) insightRows = (data ?? []) as any;
  }

  // Telegram report AI-summary cost — tiered select so a pending migration never 500s this page.
  let reportCostRows: { cost_usd: number | null; created_at: string }[] = [];
  {
    const { data, error } = await db.from("report_costs").select("cost_usd, created_at");
    if (!error) reportCostRows = (data ?? []) as any;
  }

  // Real billed Claude API costs from the Anthropic Console cost dashboard — OVERRIDES
  // our per-call token-based estimate for any day it covers (not just gap-filling),
  // since it's the actual invoiced amount rather than a computed guess. Necessary even
  // for days we do track per-call: earlier models (before Sonnet 5 came online 2026-07-06)
  // aren't priced by our $2/$10-per-M formula, so the estimate for those days is wrong.
  let actualCostRows: { usage_date: string; cost_usd: number | null }[] = [];
  {
    const { data, error } = await db.from("anthropic_actual_costs").select("usage_date, cost_usd");
    if (!error) actualCostRows = (data ?? []) as any;
  }

  // Real billed AssemblyAI costs for specific days — overrides the duration-based
  // estimate below for those exact days, since it's the actual invoiced amount rather
  // than a computed guess (duration-based estimate undercounts when a transcription
  // attempt was interrupted mid-flight and billed without ever saving a final duration).
  let assemblyActualRows: { usage_date: string; cost_usd: number | null }[] = [];
  {
    const { data, error } = await db.from("assemblyai_actual_costs").select("usage_date, cost_usd");
    if (!error) assemblyActualRows = (data ?? []) as any;
  }
  const assemblyOverrideDays = new Map(assemblyActualRows.map(r => [r.usage_date, r.cost_usd ?? 0]));

  const daily: Record<string, Bucket> = {};
  const weekly: Record<string, Bucket> = {};
  const monthly: Record<string, Bucket> = {};

  function bump(bucket: Record<string, Bucket>, key: string, field: keyof Bucket, amount: number) {
    if (!bucket[key]) bucket[key] = empty();
    bucket[key][field] += amount;
  }

  // Group our own per-call estimate by calendar day first, so a real invoiced total
  // for that day (from anthropic_actual_costs) replaces the WHOLE day's estimate
  // exactly once, rather than being layered on top of it.
  const analysisEstimateByDay = new Map<string, number>();
  for (const row of analysisRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.created_at) continue;
    const day = row.created_at.slice(0, 10);
    analysisEstimateByDay.set(day, (analysisEstimateByDay.get(day) ?? 0) + cost);
  }

  // The real Anthropic invoice total for a day covers ALL Claude usage that day — Insights
  // queries and Telegram-report AI summaries included, not just call/meeting analysis —
  // so those two categories' own tracked cost for that day must be subtracted first,
  // or they'd be counted twice (once under their own bucket, once folded into "analysis").
  const insightsCostByDay = new Map<string, number>();
  for (const row of insightRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.created_at) continue;
    const day = row.created_at.slice(0, 10);
    insightsCostByDay.set(day, (insightsCostByDay.get(day) ?? 0) + cost);
  }
  const reportsCostByDay = new Map<string, number>();
  for (const row of reportCostRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.created_at) continue;
    const day = row.created_at.slice(0, 10);
    reportsCostByDay.set(day, (reportsCostByDay.get(day) ?? 0) + cost);
  }

  const analysisActualByDay = new Map<string, number>();
  for (const row of actualCostRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.usage_date) continue;
    const day = row.usage_date.slice(0, 10);
    analysisActualByDay.set(day, (analysisActualByDay.get(day) ?? 0) + cost);
  }
  for (const day of analysisActualByDay.keys()) {
    const otherCost = (insightsCostByDay.get(day) ?? 0) + (reportsCostByDay.get(day) ?? 0);
    analysisActualByDay.set(day, Math.max(0, analysisActualByDay.get(day)! - otherCost));
  }

  // TODAY is still accruing — any "actual" row for it is just a snapshot from whenever
  // the CSV was last exported, so it can't reflect activity since that export (e.g. a
  // re-analysis run minutes ago). Only let the real invoice override CLOSED days; today
  // always uses our own live per-call estimate so it never goes stale mid-day.
  const todayKey = new Date().toISOString().slice(0, 10);

  const analysisDays = new Set([...analysisEstimateByDay.keys(), ...analysisActualByDay.keys()]);
  for (const day of analysisDays) {
    const cost = (analysisActualByDay.has(day) && day !== todayKey)
      ? analysisActualByDay.get(day)!
      : (analysisEstimateByDay.get(day) ?? 0);
    if (!cost) continue;
    const d = new Date(day);
    bump(daily, dayKey(d), "analysis", cost);
    bump(weekly, isoWeekKey(d), "analysis", cost);
    bump(monthly, monthKey(d), "analysis", cost);
  }

  // Group by calendar day first so an override (one real invoiced total for that day)
  // replaces the sum of that day's per-meeting duration-based estimates exactly once,
  // rather than being applied per-meeting.
  const durationSecondsByDay = new Map<string, number>();
  for (const row of meetingRows ?? []) {
    if (!row.duration_seconds || !row.date) continue;
    const day = row.date.slice(0, 10);
    durationSecondsByDay.set(day, (durationSecondsByDay.get(day) ?? 0) + row.duration_seconds);
  }
  const transcriptionDays = new Set([...durationSecondsByDay.keys(), ...assemblyOverrideDays.keys()]);
  for (const day of transcriptionDays) {
    const cost = assemblyOverrideDays.has(day)
      ? assemblyOverrideDays.get(day)!
      : ((durationSecondsByDay.get(day) ?? 0) / 3600) * ASSEMBLYAI_RATE_PER_HOUR;
    if (!cost) continue;
    const d = new Date(day);
    bump(daily, dayKey(d), "transcription", cost);
    bump(weekly, isoWeekKey(d), "transcription", cost);
    bump(monthly, monthKey(d), "transcription", cost);
  }

  for (const row of insightRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.created_at) continue;
    const d = new Date(row.created_at);
    bump(daily, dayKey(d), "insights", cost);
    bump(weekly, isoWeekKey(d), "insights", cost);
    bump(monthly, monthKey(d), "insights", cost);
  }

  for (const row of reportCostRows) {
    const cost = row.cost_usd ?? 0;
    if (!cost || !row.created_at) continue;
    const d = new Date(row.created_at);
    bump(daily, dayKey(d), "reports", cost);
    bump(weekly, isoWeekKey(d), "reports", cost);
    bump(monthly, monthKey(d), "reports", cost);
  }

  const toSeries = (bucket: Record<string, Bucket>) =>
    Object.entries(bucket)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({ key, analysis: v.analysis, insights: v.insights, transcription: v.transcription, reports: v.reports, total: total(v) }));

  // Full history, not just a trailing window — the frontend paginates through it so
  // older periods (e.g. last year) stay reachable instead of being cut off here.
  const dailySeries = toSeries(daily);
  const weeklySeries = toSeries(weekly);
  const monthlySeries = toSeries(monthly);

  const now = new Date();
  const thisMonthKey = monthKey(now);
  const thisWeekKey = isoWeekKey(now);
  const thisMonth = monthly[thisMonthKey] ?? empty();
  const thisWeek = weekly[thisWeekKey] ?? empty();
  const lastWeek = weekly[prevWeekKey(thisWeekKey)] ?? empty();
  const lastMonth = monthly[prevMonthKey(thisMonthKey)] ?? empty();

  // Run-rate projection based on WORKING days (Mon–Fri) only — there are no calls on
  // weekends, so counting them would understate the daily rate and skew the projection.
  const countWeekdays = (year: number, month: number, throughDay?: number) => {
    const lastDay = throughDay ?? new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= lastDay; day++) {
      const dow = new Date(year, month, day).getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  };
  const weekdaysInMonth = countWeekdays(now.getFullYear(), now.getMonth());
  const weekdaysElapsed = countWeekdays(now.getFullYear(), now.getMonth(), now.getDate());
  const projectedMonthTotal = weekdaysElapsed > 0 ? (total(thisMonth) / weekdaysElapsed) * weekdaysInMonth : 0;

  return NextResponse.json({
    daily: dailySeries,
    weekly: weeklySeries,
    monthly: monthlySeries,
    thisMonthTotal: total(thisMonth),
    thisWeekTotal: total(thisWeek),
    lastWeekTotal: total(lastWeek),
    lastMonthTotal: total(lastMonth),
    projectedMonthTotal,
  }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}
