"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "@/components/ui/date-range-picker";
import { parseServices, countsTowardAiScore, isNonTargetService, stripAgencyPrefix, SCORE_ZONES } from "@/lib/utils";

export type DashboardStats = {
  totalConversations: number;
  analyzedConversations: number;
  analyzedPct: number;
  avgTeamScore: number;
  pendingAnalysis: number;
  weeklyChange: {
    conversations: number | null;
    avgScore: number | null;
    analyzedPct: number | null;
  };
  weeklyConversations: { day: string; date: string; calls: number; meetings: number; chats: number }[];
  scoreDistribution: { range: string; count: number }[];
  zoneTrend: { day: string; date: string; red: number; yellow: number; green: number; total: number }[];
  topManagers: { id: string; name: string; score: number; total: number; trend: number; avatar_url?: string | null }[];
  recentActivity: { id: string; managerName: string; type: string; clientName: string; score: number | null; status: string; date: string }[];
  managerActivity: { id: string; name: string; total: number; avgScore: number }[];
  serviceStats: { service: string; count: number; avgScore: number }[];
  kindStats: { kind: string; count: number; avgScore: number }[];
};

const EMPTY: DashboardStats = {
  totalConversations: 0,
  analyzedConversations: 0,
  analyzedPct: 0,
  avgTeamScore: 0,
  pendingAnalysis: 0,
  weeklyChange: { conversations: null, avgScore: null, analyzedPct: null },
  weeklyConversations: ["Пн","Вт","Ср","Чт","Пт"].map((day, i) => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1 + i);
    return { day, date: d.toISOString().slice(0, 10), calls: 0, meetings: 0, chats: 0 };
  }),
  scoreDistribution: SCORE_ZONES.map(z => ({ range: z.value, count: 0 })),
  zoneTrend: [],
  topManagers: [],
  recentActivity: [],
  managerActivity: [],
  serviceStats: [],
  kindStats: [],
};

function scoreRangeValue(score: number): string {
  if (score <= 54) return "red";
  if (score <= 75) return "yellow";
  return "green";
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekDaysFor(mondayDate: Date): { day: string; date: string }[] {
  const UA = ["Пн","Вт","Ср","Чт","Пт"];
  return UA.map((day, i) => {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    return { day, date: localDateStr(d) };
  });
}

function currentMonday(): Date {
  const now = new Date();
  const diff = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - diff);
  mon.setHours(0,0,0,0);
  return mon;
}

function computeStats(convs: any[], weekDays: { day: string; date: string }[], byWeek = false): Omit<DashboardStats, "weeklyChange" | "weeklyConversations" | "recentActivity"> & { weeklyConversations: DashboardStats["weeklyConversations"] } {
  const total = convs.length;
  const pending = convs.filter(c => c.status === "analyzing" || c.status === "pending").length;
  const analyzed = convs.filter(c => c.status === "analyzed").length;
  const analyzedPct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  // Exclude "Не цільова" and non-brief/presentation kinds from score statistics —
  // only Брифування/Презентація КП are scored against real criteria.
  const targetedConvs = convs.filter(c => countsTowardAiScore(c));
  const allScores: number[] = targetedConvs
    .map(c => c.ai_analysis?.score)
    .filter((s): s is number => typeof s === "number" && s > 0);

  const avgTeamScore = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  // Weekly chart
  const weeklyConversations = weekDays.map(({ day, date }, idx) => {
    const dayConvs = convs.filter(c => {
      if (!c.date) return false;
      if (byWeek) {
        const d = localDateStr(new Date(c.date));
        const weekStart = date;
        const nextWeekStart = weekDays[idx + 1]?.date ?? "9999-99-99";
        return d >= weekStart && d < nextWeekStart;
      }
      return localDateStr(new Date(c.date)) === date;
    });
    return {
      day, date,
      calls: dayConvs.filter(c => c.type === "call").length,
      meetings: dayConvs.filter(c => c.type === "meeting").length,
      chats: dayConvs.filter(c => c.type === "chat").length,
    };
  });

  // Score distribution — the three coaching zones (red/yellow/green), see SCORE_ZONES.
  const ranges = SCORE_ZONES.map(z => z.value);
  const distMap: Record<string, number> = Object.fromEntries(ranges.map(r => [r, 0]));
  for (const s of allScores) distMap[scoreRangeValue(s)]++;
  const scoreDistribution = ranges.map(range => ({ range, count: distMap[range] }));

  // Zone trend over the same buckets as weeklyConversations above — same scored
  // (Брифування/Презентація КП) population as scoreDistribution, just split by
  // bucket instead of summed over the whole period, so progress toward the Q3
  // zone targets (shrinking red, growing green) is visible over time.
  const zoneTrend = weekDays.map(({ day, date }, idx) => {
    const bucketConvs = targetedConvs.filter(c => {
      if (!c.date) return false;
      const d = localDateStr(new Date(c.date));
      if (byWeek) {
        const weekStart = date;
        const nextWeekStart = weekDays[idx + 1]?.date ?? "9999-99-99";
        return d >= weekStart && d < nextWeekStart;
      }
      return d === date;
    });
    const bucketScores = bucketConvs
      .map(c => c.ai_analysis?.score)
      .filter((s): s is number => typeof s === "number" && s > 0);
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const s of bucketScores) counts[scoreRangeValue(s) as "red" | "yellow" | "green"]++;
    return { day, date, ...counts, total: bucketScores.length };
  });

  // Top managers + manager activity
  const mgrMap: Record<string, { id: string; name: string; scores: number[]; total: number; avatar_url?: string | null }> = {};
  for (const c of convs) {
    if (!c.manager_id || !c.manager?.name) continue;
    const id = c.manager_id;
    if (!mgrMap[id]) mgrMap[id] = { id, name: c.manager.name, scores: [], total: 0, avatar_url: c.manager.avatar_url ?? null };
    mgrMap[id].total++;
    if (countsTowardAiScore(c) && typeof c.ai_analysis?.score === "number" && c.ai_analysis.score > 0) {
      mgrMap[id].scores.push(c.ai_analysis.score);
    }
  }
  const topManagers = Object.values(mgrMap)
    .map(m => ({
      id: m.id,
      name: m.name,
      total: m.total,
      score: m.scores.length ? Math.round(m.scores.reduce((a,b) => a+b,0) / m.scores.length) : 0,
      trend: 0,
      avatar_url: m.avatar_url ?? null,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const managerActivity = Object.values(mgrMap)
    .map(m => ({
      id: m.id,
      name: m.name,
      total: m.total,
      avgScore: m.scores.length ? Math.round(m.scores.reduce((a,b) => a+b,0) / m.scores.length) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Service stats — a conversation can list multiple services (e.g. "SEO,PPC"),
  // each one gets counted toward its own bucket rather than forming a combined bucket.
  const svcMap: Record<string, { count: number; scores: number[] }> = {};
  for (const c of convs) {
    const services = parseServices(c.service);
    for (const svc of services) {
      if (!svcMap[svc]) svcMap[svc] = { count: 0, scores: [] };
      svcMap[svc].count++;
      if (countsTowardAiScore(c) && typeof c.ai_analysis?.score === "number" && c.ai_analysis.score > 0) {
        svcMap[svc].scores.push(c.ai_analysis.score);
      }
    }
  }
  const serviceStats = Object.entries(svcMap)
    .map(([service, { count, scores }]) => ({
      service,
      count,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Kind stats — the bucket itself already tells you whether the average is a "real"
  // efficiency score (Брифування/Презентація КП) or just informational (everything else).
  const kindMap: Record<string, { count: number; scores: number[] }> = {};
  for (const c of convs) {
    const kind = c.conversation_kind ?? "Не визначено";
    if (!kindMap[kind]) kindMap[kind] = { count: 0, scores: [] };
    kindMap[kind].count++;
    if (!isNonTargetService(c.service) && typeof c.ai_analysis?.score === "number" && c.ai_analysis.score > 0) {
      kindMap[kind].scores.push(c.ai_analysis.score);
    }
  }
  const kindStats = Object.entries(kindMap)
    .map(([kind, { count, scores }]) => ({
      kind,
      count,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalConversations: total, analyzedConversations: analyzed, analyzedPct, avgTeamScore, pendingAnalysis: pending, weeklyConversations, scoreDistribution, zoneTrend, topManagers, managerActivity, serviceStats, kindStats };
}

export function useDashboardStats(dateRange?: DateRange) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { conversations: allConvs } = await res.json();
        if (!allConvs?.length) { setLoading(false); return; }

        // Filter by date range if provided
        const filtered = (dateRange?.from || dateRange?.to)
          ? allConvs.filter((c: any) => {
              if (!c.date) return false;
              const d = new Date(c.date);
              if (dateRange.from && d < dateRange.from) return false;
              if (dateRange.to) { const to = new Date(dateRange.to); to.setHours(23,59,59,999); if (d > to) return false; }
              return true;
            })
          : allConvs;

        // Chart days: build from actual date range
        const UA_SHORT = ["Нд","Пн","Вт","Ср","Чт","Пт","Сб"];
        let weekDays: { day: string; date: string }[];
        if (dateRange?.from && dateRange?.to) {
          const from = new Date(dateRange.from);
          from.setHours(0,0,0,0);
          const to = new Date(dateRange.to);
          to.setHours(0,0,0,0);
          const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
          if (diffDays <= 14) {
            weekDays = Array.from({ length: diffDays + 1 }, (_, i) => {
              const d = new Date(from);
              d.setDate(from.getDate() + i);
              return { day: UA_SHORT[d.getDay()], date: localDateStr(d) };
            });
          } else {
            weekDays = [];
            const cur = new Date(from);
            const startDow = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
            cur.setDate(cur.getDate() - startDow);
            while (cur <= to) {
              const label = `${cur.getDate()}.${String(cur.getMonth()+1).padStart(2,"0")}`;
              weekDays.push({ day: label, date: localDateStr(new Date(cur)) });
              cur.setDate(cur.getDate() + 7);
            }
          }
        } else {
          weekDays = weekDaysFor(currentMonday());
        }
        const current = computeStats(filtered, weekDays, !!(dateRange?.from && dateRange?.to && Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / 86400000) > 14));

        // Recent activity (from all convs, not filtered)
        const recentActivity = allConvs.slice(0, 5).map((c: any) => {
          const parts = (c.manager?.name ?? "").split(" ");
          const managerName = parts.length >= 2 ? `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}` : (c.manager?.name ?? "—");
          return { id: c.id, managerName, type: c.type ?? "call", clientName: stripAgencyPrefix(c.client_name) || "Невідомий", score: c.ai_analysis?.score ?? null, status: c.status ?? "analyzing", date: c.date ?? "" };
        });

        // Previous period for weeklyChange
        const mon = currentMonday();
        const prevMon = new Date(mon);
        prevMon.setDate(mon.getDate() - 7);
        const prevSun = new Date(mon);
        prevSun.setDate(mon.getDate() - 1);
        prevSun.setHours(23,59,59,999);
        const prevConvs = allConvs.filter((c: any) => {
          if (!c.date) return false;
          const d = new Date(c.date);
          return d >= prevMon && d <= prevSun;
        });

        let weeklyChange: DashboardStats["weeklyChange"] = { conversations: null, avgScore: null, analyzedPct: null };
        if (prevConvs.length > 0) {
          const prev = computeStats(prevConvs, weekDaysFor(prevMon));
          const diffConv = current.totalConversations - prev.totalConversations;
          const diffScore = current.avgTeamScore - prev.avgTeamScore;
          const diffPct = current.analyzedPct - prev.analyzedPct;
          weeklyChange = {
            conversations: prev.totalConversations > 0 ? Math.round((diffConv / prev.totalConversations) * 100) : null,
            avgScore: diffScore !== 0 ? diffScore : null,
            analyzedPct: diffPct !== 0 ? diffPct : null,
          };
        }

        setStats({ ...current, recentActivity, weeklyChange });
      } catch (e) {
        console.error("[useDashboardStats]", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    // Auto-refresh every 60s so newly analyzed calls appear without manual reload.
    // Also refetch on tab focus/visibility so backgrounded-tab timer throttling
    // can't leave a long-open tab showing stale stats.
    const interval = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, [dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return { stats, loading };
}
