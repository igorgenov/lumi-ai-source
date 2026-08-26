"use client";

import { useEffect, useState } from "react";
import { countsTowardAiScore, shrinkScoreForRanking, SCORE_ZONES, scoreZone } from "@/lib/utils";

export type ManagerWithStats = {
  id: string;
  name: string;
  email: string;
  role?: string;
  position?: string;
  avatar_url?: string | null;
  // Last time this manager's session was seen active in Lumi (throttled ~5 min, see
  // lib/auth.ts) — null if they've never logged in. Powers the "давно не заходив" badge.
  last_active_at?: string | null;
  stats: {
    totalConversations: number;
    avgScore: number;
    // Ranking-only blend toward the team average, weighted by scoredConversations —
    // NEVER shown as "the score", only used to decide sort order / Лідер / Потребує
    // уваги so a manager with 1-2 scored calls can't land at the extreme top or
    // bottom of the leaderboard on a sample too small to trust.
    shrunkScore: number;
    scoredConversations: number;
    successRate: number;
    avgCallDuration: number;
    totalCalls: number;
    totalMeetings: number;
    weeklyTrend: number;
    // false right after a new week starts (e.g. Monday morning) — there's no scored
    // conversation yet to compare against, which is different from "trend is flat".
    weeklyTrendAvailable: boolean;
    monthlyScores: { month: string; score: number }[];
    weeklyScores: { week: string; score: number }[];
    // Same underlying scale, but scoped to whatever dateRange the page passed in — replaces the
    // old "always last 6 months / last 5 weeks regardless of the filter" mini-chart data, which
    // looked disconnected from (and sometimes contradicted) the period the user had selected.
    periodGranularity: "week" | "month";
    periodScores: ({ week: string; score: number } | { month: string; score: number })[];
    serviceDistribution: { service: string; count: number }[];
    // Same three coaching zones as the Dashboard's "Розподіл по зонах" widget,
    // scoped to just this manager's scored (Брифування/Презентація КП) conversations
    // for the selected period — so a coach can see at a glance where THIS manager's
    // calls actually land, not just their single average score.
    scoreDistribution: { range: string; count: number }[];
  };
};

const MONTHS_UA = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

function buildMonthlyScores(analyzed: any[]): { month: string; score: number }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthConvs = analyzed.filter((c: any) => {
      if (!c.date) return false;
      const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
      const cd = new Date(raw);
      return cd.getFullYear() === year && cd.getMonth() === month;
    });
    const scores = monthConvs
      .filter((c: any) => countsTowardAiScore(c))
      .map((c: any) => c.ai_analysis?.score)
      .filter((s: any): s is number => typeof s === "number" && s > 0);
    return {
      month: MONTHS_UA[month],
      score: scores.length
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : 0,
    };
  });
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function buildWeeklyScores(analyzed: any[]): { week: string; score: number }[] {
  // Calendar weeks (Mon–Sun) — labeled by ISO week-of-year number so the axis
  // reads consistently instead of always restarting at "Тиж 1".
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // days since this week's Monday
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - dow);

  return [1, 2, 3, 4, 5].map(w => {
    const weeksAgo = 5 - w; // w=5 -> 0 (this week), w=1 -> 4 weeks ago
    const rangeStart = new Date(thisMonday);
    rangeStart.setDate(thisMonday.getDate() - weeksAgo * 7);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 6);
    rangeEnd.setHours(23, 59, 59, 999);
    const weekConvs = analyzed.filter((c: any) => {
      if (!c.date) return false;
      const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
      const cd = new Date(raw);
      return cd >= rangeStart && cd <= rangeEnd;
    });
    const scores = weekConvs
      .filter((c: any) => countsTowardAiScore(c))
      .map((c: any) => c.ai_analysis?.score)
      .filter((s: any): s is number => typeof s === "number" && s > 0);
    return {
      week: `Тиж ${getISOWeek(rangeStart)}`,
      score: scores.length
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : 0,
    };
  });
}

// Mini-chart buckets scoped to the exact same dateRange the page's calendar picker already
// filters everything else by — instead of the old fixed "last 6 months / last 5 weeks"
// window, which stayed the same no matter what period was selected and made the chart look
// disconnected (sometimes empty) from the numbers right above it. Granularity (week vs month)
// is chosen automatically from how wide the selected range is.
function buildPeriodScores(
  analyzed: any[],
  dateRange?: { from: Date | null; to: Date | null }
): { granularity: "week" | "month"; points: ({ week: string; score: number } | { month: string; score: number })[] } {
  if (!dateRange?.from || !dateRange?.to) {
    return { granularity: "week", points: buildWeeklyScores(analyzed) };
  }
  const from = dateRange.from;
  const to = dateRange.to;
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const scoreFor = (convs: any[]) => {
    const scores = convs
      .filter((c: any) => countsTowardAiScore(c))
      .map((c: any) => c.ai_analysis?.score)
      .filter((s: any): s is number => typeof s === "number" && s > 0);
    return scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
  };

  if (spanDays <= 60) {
    const dow = from.getDay() === 0 ? 6 : from.getDay() - 1;
    const firstMonday = new Date(from);
    firstMonday.setHours(0, 0, 0, 0);
    firstMonday.setDate(from.getDate() - dow);
    const weeks: { week: string; score: number }[] = [];
    for (let cursor = new Date(firstMonday); cursor <= to && weeks.length < 20; cursor.setDate(cursor.getDate() + 7)) {
      const rangeStart = new Date(cursor);
      const rangeEnd = new Date(cursor);
      rangeEnd.setDate(rangeEnd.getDate() + 6);
      rangeEnd.setHours(23, 59, 59, 999);
      const weekConvs = analyzed.filter((c: any) => {
        if (!c.date) return false;
        const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
        const cd = new Date(raw);
        return cd >= rangeStart && cd <= rangeEnd;
      });
      weeks.push({ week: `Тиж ${getISOWeek(rangeStart)}`, score: scoreFor(weekConvs) });
    }
    return { granularity: "week", points: weeks };
  }

  const months: { month: string; score: number }[] = [];
  const endCursor = new Date(to.getFullYear(), to.getMonth(), 1);
  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= endCursor && months.length < 24; cursor.setMonth(cursor.getMonth() + 1)) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthConvs = analyzed.filter((c: any) => {
      if (!c.date) return false;
      const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
      const cd = new Date(raw);
      return cd.getFullYear() === year && cd.getMonth() === month;
    });
    months.push({ month: MONTHS_UA[month], score: scoreFor(monthConvs) });
  }
  return { granularity: "month", points: months };
}

function filterByDateRange(convs: any[], dateRange?: { from: Date | null; to: Date | null }): any[] {
  if (!dateRange?.from && !dateRange?.to) return convs;
  return convs.filter((c: any) => {
    if (!c.date) return false;
    const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
    const d = new Date(raw);
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to) {
      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  });
}

function computeManagerStats(
  m: any,
  allConvs: any[],
  dateRange?: { from: Date | null; to: Date | null }
): ManagerWithStats {
  const mine = allConvs.filter((c: any) => c.manager_id === m.id);
  const filtered = filterByDateRange(mine, dateRange);

  const calls = filtered.filter((c: any) => c.type === "call").length;
  const meetings = filtered.filter((c: any) => c.type === "meeting").length;
  const analyzed = filtered.filter((c: any) => c.status === "analyzed");
  const scores: number[] = analyzed
    .filter((c: any) => countsTowardAiScore(c))
    .map((c: any) => c.ai_analysis?.score)
    .filter((s: any): s is number => typeof s === "number" && s > 0);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
    : 0;
  const successRate = filtered.length
    ? Math.round((analyzed.length / filtered.length) * 100)
    : 0;

  const zoneCounts: Record<string, number> = Object.fromEntries(SCORE_ZONES.map(z => [z.value, 0]));
  for (const s of scores) zoneCounts[scoreZone(s).value]++;
  const scoreDistribution = SCORE_ZONES.map(z => ({ range: z.value, count: zoneCounts[z.value] }));

  // Monthly/weekly scores always from all-time data — used for weeklyTrend below (which must
  // stay pinned to the real current/previous calendar week) and other pages' team-wide charts.
  const allAnalyzed = mine.filter((c: any) => c.status === "analyzed");
  const monthlyScores = buildMonthlyScores(allAnalyzed);
  const weeklyScores = buildWeeklyScores(allAnalyzed);
  const { granularity: periodGranularity, points: periodScores } = buildPeriodScores(allAnalyzed, dateRange);

  // This-week vs last-week point delta. If either week has no scored conversations yet
  // (score defaults to 0 — e.g. right after a new week starts, before anyone's had a scored
  // call), there's nothing real to compare. weeklyTrendAvailable lets the UI say "no data
  // yet" instead of silently showing "+0%", which reads as "unchanged" rather than "unknown".
  const thisWeek = weeklyScores[weeklyScores.length - 1];
  const lastWeek = weeklyScores[weeklyScores.length - 2];
  const weeklyTrendAvailable = thisWeek?.score > 0 && lastWeek?.score > 0;
  const weeklyTrend = weeklyTrendAvailable ? thisWeek.score - lastWeek.score : 0;

  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    position: m.position ?? "Менеджер",
    avatar_url: m.avatar_url ?? null,
    last_active_at: m.last_active_at ?? null,
    stats: {
      totalConversations: filtered.length,
      avgScore,
      shrunkScore: avgScore, // placeholder — overwritten below once every manager's raw avgScore is known
      scoredConversations: scores.length,
      successRate,
      avgCallDuration: 0,
      totalCalls: calls,
      totalMeetings: meetings,
      weeklyTrend,
      weeklyTrendAvailable,
      monthlyScores,
      weeklyScores,
      periodGranularity,
      periodScores,
      serviceDistribution: [],
      scoreDistribution,
    },
  };
}

export function useManagers(dateRange?: { from: Date | null; to: Date | null }) {
  const [rawData, setRawData] = useState<{ convs: any[]; mgrData: any[] } | null>(null);
  const [managers, setManagers] = useState<ManagerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch once
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const { conversations: convs, managers: mgrData } = await res.json();
        if (!mgrData || mgrData.length === 0) {
          setManagers([]);
          setLoading(false);
          return;
        }
        setRawData({ convs: convs ?? [], mgrData });
      } catch (e: any) {
        setError(e.message);
        setManagers([]);
        setLoading(false);
      }
    }
    fetchData();
    // Auto-refresh every 60s so stats reflect newly analyzed calls without manual reload.
    // Also refetch on tab focus/visibility so backgrounded-tab timer throttling
    // can't leave a long-open tab showing stale stats.
    const interval = setInterval(fetchData, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchData(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchData);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchData);
    };
  }, []);

  // Recompute stats when rawData or dateRange changes (no re-fetch)
  useEffect(() => {
    if (!rawData) return;
    const result = rawData.mgrData.map((m: any) =>
      computeManagerStats(m, rawData.convs, dateRange)
    );
    // Pooled team average (weighted by each manager's sample size, not a flat
    // average-of-averages) — the reference point ranking shrinks toward.
    const totalN = result.reduce((s, m) => s + m.stats.scoredConversations, 0);
    const teamAvg = totalN
      ? result.reduce((s, m) => s + m.stats.avgScore * m.stats.scoredConversations, 0) / totalN
      : 0;
    for (const m of result) {
      m.stats.shrunkScore = shrinkScoreForRanking(m.stats.avgScore, m.stats.scoredConversations, teamAvg);
    }
    setManagers(result);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return { managers, loading, error };
}
