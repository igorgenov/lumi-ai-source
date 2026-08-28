"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { scoreColor, scoreBarColor, cn, generateSlug, NEEDS_ATTENTION_THRESHOLD, INACTIVE_DAYS_THRESHOLD, SCORE_ZONES, ZONE_TARGET } from "@/lib/utils";
import { useManagers } from "@/hooks/useManagers";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { RankBadge } from "@/components/ui/rank-badge";
import { Phone, Video, TrendingUp, TrendingDown, Star, AlertTriangle, BarChart3, Search, X, Lock } from "lucide-react";
import { BrandArrowRight } from "@/components/icons/brand-icons";
import Link from "next/link";
import { DateRangePicker, DateRange, currentMonthRange } from "@/components/ui/date-range-picker";
import { InfoHint as Hint } from "@/components/ui/info-hint";

function fmtShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}

function fmtDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateParam(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function AccessDenied() {
  return (
    <div>
      <Header title="Команда" subtitle="Рейтинг та статистика по кожному менеджеру" />
      <div className="p-6 flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center">
          <Lock className="w-5 h-5 text-primary/40" />
        </div>
        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Доступ обмежено
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Сторінка менеджерів доступна лише для адміністраторів. Зверніться до керівника відділу.
        </p>
      </div>
    </div>
  );
}

export default function ManagersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = useEffectiveRole();
  const searchParams = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const from = parseDateParam(searchParams.get("from"));
    const to = parseDateParam(searchParams.get("to"));
    return from || to ? { from, to } : currentMonthRange();
  });
  const [sortBy, setSortBy] = useState<"score" | "activity" | "trend">(() => {
    const s = searchParams.get("sort");
    return s === "activity" || s === "trend" ? s : "score";
  });
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [attentionOnly, setAttentionOnly] = useState(() => searchParams.get("attention") === "1");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const MAX_COMPARE = 5;
  const { managers: allManagers, loading } = useManagers(dateRange);

  // Deep link from a manager's profile page ("Порівняти з іншим менеджером") — pre-selects
  // that manager so the user only has to pick the second one to compare against.
  useEffect(() => {
    const compareFromUrl = searchParams.get("compare");
    if (compareFromUrl) setCompareIds([compareFromUrl]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync so returning from a manager's profile page (via back navigation)
  // restores the same filtered/sorted view instead of resetting to defaults.
  useEffect(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", fmtDateParam(dateRange.from));
    if (dateRange.to) params.set("to", fmtDateParam(dateRange.to));
    if (sortBy !== "score") params.set("sort", sortBy);
    if (search) params.set("q", search);
    if (attentionOnly) params.set("attention", "1");
    const qs = params.toString();
    router.replace(qs ? `/team?${qs}` : "/team", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, sortBy, search, attentionOnly]);

  // Show all team members
  const managers = allManagers;

  if (status === "loading") return (
    <div>
      <Header title="Команда" subtitle="Рейтинг та статистика по кожному менеджеру проєктів" />
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
  if (role !== "admin" && role !== "owner" && role !== "pm") return <AccessDenied />;

  function toggleCompare(id: string) {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev
    );
  }

  // KPI calculations
  // Sort/rank uses shrunkScore (blended toward the team average by sample size) so a
  // manager with 1-2 scored calls can't land at the extreme top or bottom of the
  // leaderboard — the NUMBER shown on every card/row is still the real avgScore.
  // "Потребує уваги"/"Лідер" badges and the needsAttention threshold below compare
  // against that same real avgScore, not shrunkScore — the flag has to agree with
  // the number actually on screen (confirmed 2026-07-28: mismatched threshold logic
  // silently flagged a higher-scoring manager while skipping a lower-scoring one).
  const sorted = [...managers].sort((a, b) => {
    if (sortBy === "activity") return b.stats.totalConversations - a.stats.totalConversations;
    if (sortBy === "trend") return b.stats.weeklyTrend - a.stats.weeklyTrend;
    return b.stats.shrunkScore - a.stats.shrunkScore;
  });
  const avgTeamScore = managers.length
    ? Math.round(managers.reduce((s, m) => s + m.stats.avgScore, 0) / managers.length)
    : 0;
  const totalConversations = managers.reduce((s, m) => s + m.stats.totalConversations, 0);
  const bestManager = sorted[0];
  // scoredConversations === 0 means "немає оцінених розмов цього періоду", not "низький бал" —
  // avgScore defaults to 0 in that case, which used to trivially satisfy the threshold and flagged
  // nearly every manager with no data yet, burying managers who genuinely score low. Compares
  // against the REAL avgScore (not shrunkScore) — that's the number shown on every card, so the
  // flag has to agree with it or a lower-scoring manager can go unflagged for no visible reason
  // while a higher-scoring one gets flagged (confirmed 2026-07-28).
  const needsAttention = managers.filter(m =>
    m.stats.scoredConversations > 0 && (m.stats.avgScore < NEEDS_ATTENTION_THRESHOLD || m.stats.weeklyTrend < 0));
  const displayed = sorted.filter(m =>
    (!search || m.name.toLowerCase().includes(search.toLowerCase())) &&
    (!attentionOnly || needsAttention.some(n => n.id === m.id))
  );

  if (loading) return (
    <div>
      <Header title="Команда" subtitle="Рейтинг та статистика по кожному менеджеру" />
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  return (
    <div>
      <Header title="Команда" subtitle="Рейтинг та статистика по кожному менеджеру" />

      <div className="p-6 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Середній бал команди
                <Hint text="Середній бал по всій команді за обраний період — всі типи зустрічей (єдині типи з активними критеріями оцінки)." className="ml-1" />
              </p>
              <p className="text-3xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{avgTeamScore}</p>
              <p className="text-xs text-muted-foreground mt-1">з 100 можливих</p>
            </div>
            <div className="p-2 rounded-lg bg-accent/15 text-accent-strong shrink-0">
              <Star className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Розмов всього</p>
              <p className="text-3xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{totalConversations}</p>
              <p className="text-xs text-muted-foreground mt-1">по всіх менеджерах</p>
            </div>
            <div className="p-2 rounded-lg bg-primary/8 text-primary shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>

          {bestManager ? (
            <Link href={`/team/${generateSlug(bestManager.name)}`}
              className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3 hover:shadow-sm hover:border-primary/20 transition-all group">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Лідер місяця</p>
                <p className="text-sm font-black text-primary truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {bestManager.name.split(" ")[0]} {bestManager.name.split(" ")[1]}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                  {bestManager.stats.avgScore} балів
                  {bestManager.stats.weeklyTrendAvailable && ` · ${bestManager.stats.weeklyTrend >= 0 ? "+" : ""}${bestManager.stats.weeklyTrend}% тренд`}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
            </Link>
          ) : (
            <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Лідер місяця</p>
                <p className="text-sm text-muted-foreground">Немає даних</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          )}

          <button
            onClick={() => needsAttention.length > 0 && setAttentionOnly(v => !v)}
            className={cn(
              "bg-card rounded-xl p-4 flex items-start justify-between gap-3 text-left transition-all",
              needsAttention.length > 0 ? "border border-red-200 dark:border-red-500/30" : "border border-emerald-200 dark:border-emerald-500/30",
              needsAttention.length > 0 && "hover:shadow-sm hover:border-red-300 dark:border-red-500/30 cursor-pointer",
              attentionOnly && "ring-2 ring-red-300"
            )}>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Потребують уваги
                <Hint text={`Менеджер потрапляє сюди, якщо за обраний період середній AI-бал нижче ${NEEDS_ATTENTION_THRESHOLD} (категорії «Критично» та «Слабко» на шкалі «Розподіл балів») АБО динаміка балу цього тижня від'ємна — і має хоча б одну оцінену розмову цього періоду. Тому менеджер з вищим балом, але спадною динамікою, може потрапити сюди раніше за того з нижчим, але стабільним. Натисни картку, щоб показати тільки їх.`} className="ml-1" />
              </p>
              <p className={cn("text-3xl font-black", needsAttention.length > 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{needsAttention.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {needsAttention.length > 0
                  ? needsAttention.map(m => m.name.split(" ")[0]).join(", ")
                  : "Всі показники в нормі"}
              </p>
              {attentionOnly && (
                <p className="text-[10px] font-bold text-red-500 mt-1">Фільтр активний — натисни ще раз, щоб скинути</p>
              )}
            </div>
            <div className={cn("p-2 rounded-lg shrink-0",
              needsAttention.length > 0 ? "bg-red-50 dark:bg-red-500/10 text-red-500" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            {([
              ["score",      "За балом",             "Середній AI-бал за обраний період (всі типи зустрічей)"],
              ["activity",   "За кількістю розмов",  "Загальна кількість дзвінків і зустрічей за обраний період — незалежно від того, чи рівномірно вони розподілені по тижнях"],
              ["trend",      "За трендом",            "Зміна середнього бала цього тижня порівняно з минулим (в балах)"],
            ] as const).map(([val, label, hint]) => (
              <button
                key={val}
                onClick={() => setSortBy(val)}
                title={hint}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md transition-colors",
                  sortBy === val
                    ? "bg-accent text-white font-bold"
                    : "text-muted-foreground hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
              >
                {label}
              </button>
            ))}
          </div>
          <DateRangePicker value={dateRange} onChange={setDateRange} align="right" />
        </div>

        {/* Team overview — every manager's score at a glance, before scrolling through cards */}
        {sorted.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Команда за балом
              </p>
              <span className="text-[10px] text-muted-foreground/70">
                · {dateRange.from ? fmtShortDate(dateRange.from) : "—"} — {dateRange.to ? fmtShortDate(dateRange.to) : "—"}
              </span>
            </div>
            <div className="space-y-2">
              {[...sorted].sort((a, b) => b.stats.shrunkScore - a.stats.shrunkScore).map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-xs text-foreground/80 w-28 shrink-0 truncate" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    {m.name.split(" ")[0]}
                  </span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-300", m.stats.avgScore === 0 ? "bg-border" : scoreBarColor(m.stats.avgScore))}
                      style={{ width: `${Math.max(m.stats.avgScore, 2)}%` }} />
                  </div>
                  <span className={cn("text-xs font-black w-8 text-right shrink-0", scoreColor(m.stats.avgScore))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    {m.stats.avgScore || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map((mgr, i) => (
            <Link
              key={mgr.id}
              href={`/team/${generateSlug(mgr.name)}`}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ManagerAvatar name={mgr.name} avatarUrl={mgr.avatar_url} className="w-11 h-11 rounded-xl text-lg" />
                    <RankBadge rank={i + 1} className="absolute -top-1.5 -left-1.5 w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name}</p>
                      {mgr.stats.scoredConversations > 0 && (mgr.stats.avgScore < NEEDS_ATTENTION_THRESHOLD || mgr.stats.weeklyTrend < 0) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                          title={`AI-бал нижче ${NEEDS_ATTENTION_THRESHOLD} або динаміка бала цього тижня від'ємна (будь-яке зниження)`}>
                          ⚠ Потребує уваги
                        </span>
                      )}
                      {mgr.stats.avgScore >= 85 && mgr.stats.weeklyTrend > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                          ★ Лідер
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{mgr.position}</p>
                    {(() => {
                      const daysInactive = mgr.last_active_at
                        ? Math.floor((Date.now() - new Date(mgr.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      if (daysInactive === null || daysInactive < INACTIVE_DAYS_THRESHOLD) return null;
                      return (
                        <span
                          title={mgr.last_active_at ? `Останній вхід: ${new Date(mgr.last_active_at).toLocaleDateString("uk-UA")}` : "Ще жодного разу не заходив у Lumi"}
                          className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 text-[10px] font-bold whitespace-nowrap">
                          {mgr.last_active_at ? `не заходив ${daysInactive} дн.` : "ще не заходив"}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-2xl font-black", scoreColor(mgr.stats.avgScore))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    {mgr.stats.avgScore}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center justify-end">
                    AI бал
                    <Hint text="Середній бал за обраний період — всі типи зустрічей (єдині типи з активними критеріями оцінки)." className="ml-1" />
                  </p>
                </div>
              </div>

              {/* Zone mix bar — stacked red/yellow/green share of this manager's own scored
                  conversations, so it's visible across the whole list who's already inside
                  the Q3 target (green tick) without opening every profile individually. */}
              <div className="mb-4">
                {mgr.stats.scoredConversations > 0 ? (() => {
                  const total = mgr.stats.scoredConversations;
                  const dist = Object.fromEntries(mgr.stats.scoreDistribution.map(d => [d.range, d.count]));
                  const redTarget = ZONE_TARGET.red?.value ?? 0;
                  const greenTarget = ZONE_TARGET.green?.value ?? 0;
                  return (
                    <div className="h-2 bg-secondary rounded-full overflow-hidden flex relative"
                      title={SCORE_ZONES.map(z => `${z.label}: ${Math.round(((dist[z.value] ?? 0) / total) * 100)}%`).join(" · ")}>
                      {SCORE_ZONES.map(z => {
                        const pct = Math.round(((dist[z.value] ?? 0) / total) * 100);
                        return <div key={z.value} className={cn("h-full", z.bar)} style={{ width: `${pct}%` }} />;
                      })}
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-white/70" style={{ left: `${redTarget}%` }}
                        title={`Ціль Q3 по червоній зоні: не більше ${redTarget}%`} />
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-white/70" style={{ right: `${greenTarget}%` }}
                        title={`Ціль Q3 по зеленій зоні: не менше ${greenTarget}%`} />
                    </div>
                  );
                })() : (
                  <div className="h-2 bg-secondary rounded-full" />
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 text-center mb-4">
                {[
                  { label: "Розмов",    value: mgr.stats.totalConversations, hint: "Загальна кількість дзвінків і зустрічей за обраний період — клікни, щоб перейти до списку", clickable: true },
                  { label: "Опрацьовано", value: `${mgr.stats.successRate}%`,  hint: "Відсоток розмов менеджера, що вже пройшли AI-аналіз (не плутати з конверсією в продаж — даних про угоди система поки не отримує)" },
                  { label: "Дзвінки",   value: <span className="flex items-center justify-center gap-1"><Phone className="w-3 h-3 text-primary" />{mgr.stats.totalCalls}</span>,    hint: "Кількість телефонних дзвінків" },
                  { label: "Зустрічі",  value: <span className="flex items-center justify-center gap-1"><Video className="w-3 h-3 text-accent-strong" />{mgr.stats.totalMeetings}</span>, hint: "Кількість Google Meet зустрічей" },
                ].map(({ label, value, hint, clickable }) => (
                  <div key={label}
                    onClick={clickable ? (e => { e.preventDefault(); e.stopPropagation(); router.push(`/conversations?manager=${mgr.id}`); }) : undefined}
                    className={cn(
                      "relative bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg py-2 px-1 group/stat",
                      clickable && "hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-colors"
                    )}>
                    <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-[#1C1C1C] text-white text-[11px]
                      leading-snug rounded-lg px-3 py-2 shadow-lg opacity-0 pointer-events-none
                      group-hover/stat:opacity-100 transition-opacity duration-150 z-50 whitespace-normal text-left"
                      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                      {hint}
                      <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2.5 h-2.5 bg-[#1C1C1C] rotate-45" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Mini trend chart — scoped to the page's selected date range (bucketed into
                  weeks or months depending on how wide that range is, see periodScores in
                  useManagers). Bars always colored by the same score scale (scoreBarColor) so
                  a glance at red vs. green reads the same as everywhere else. */}
              {(() => {
                const points = mgr.stats.periodScores;
                if (points.length === 0) return null;
                const keyOf = (p: { month: string; score: number } | { week: string; score: number }) =>
                  "month" in p ? p.month : p.week;
                return (
                  <>
                    {/* Same period as the calendar filter above — bucketed by week or month
                        depending on how wide the selected range is. Taller chart area (64px)
                        than the original 32px so the 0-100 scale, and real differences between
                        managers, are legible instead of every bar looking equally "minimal". */}
                    <div className="flex items-end gap-1 h-16">
                      {points.map(p => (
                        <div key={keyOf(p)} className="flex-1" title={`${keyOf(p)}: ${p.score || "—"}`}>
                          <div
                            className={cn("w-full rounded-t-sm", p.score === 0 ? "bg-border" : scoreBarColor(p.score))}
                            style={{ height: `${p.score === 0 ? 2 : (p.score / 100) * 60}px` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1 items-center">
                      <span className="text-[10px] text-muted-foreground/40 mr-1" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        {keyOf(points[0])}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 flex-1 text-center" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        {mgr.stats.periodGranularity === "month" ? "по місяцях за обраний період" : "по тижнях за обраний період"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 ml-1" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        {keyOf(points[points.length - 1])}
                      </span>
                    </div>
                  </>
                );
              })()}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                  {!mgr.stats.weeklyTrendAvailable ? (
                    <span className="text-xs text-muted-foreground/70" title="Ще немає оціненої розмови за цей і/або минулий тиждень для порівняння">
                      Ще немає даних цього тижня
                    </span>
                  ) : (
                    <>
                      {mgr.stats.weeklyTrend >= 0
                        ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        : <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                      }
                      <span className={cn("text-xs font-medium", mgr.stats.weeklyTrend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                        {mgr.stats.weeklyTrend >= 0 ? "+" : ""}{mgr.stats.weeklyTrend}% цього тижня
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {mgr.stats.scoredConversations > 0 && (mgr.stats.avgScore < NEEDS_ATTENTION_THRESHOLD || mgr.stats.weeklyTrend < 0) && (
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/coaching/plans?manager=${mgr.id}`); }}
                      className="text-[10px] font-bold px-2 py-1 rounded-md border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:bg-amber-500/15 transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                      title="Створити план коучингу для цього менеджера">
                      План коучингу
                    </button>
                  )}
                  <button
                    onClick={e => { e.preventDefault(); toggleCompare(mgr.id); }}
                    className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-md border transition-colors",
                      compareIds.includes(mgr.id)
                        ? "bg-primary text-white border-primary"
                        : compareIds.length >= MAX_COMPARE
                          ? "text-muted-foreground/30 border-border cursor-not-allowed"
                          : "text-muted-foreground border-border hover:border-primary/40 hover:text-primary"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                    disabled={compareIds.length >= MAX_COMPARE && !compareIds.includes(mgr.id)}
                  >
                    {compareIds.includes(mgr.id) ? "✓ Обрано" : "Порівняти"}
                  </button>
                  <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    Детальніше <BrandArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {/* Compare panel */}
        {compareIds.length >= 2 && (() => {
          const chosen = compareIds.map(id => managers.find(m => m.id === id)!).filter(Boolean);
          const LOW_SAMPLE_THRESHOLD = 5;
          const metrics: { label: string; get: (m: typeof chosen[number]) => number; suffix: string; lowSampleAware?: boolean }[] = [
            { label: "AI Бал (Брифування/КП)", get: m => m.stats.avgScore, suffix: "", lowSampleAware: true },
            { label: "Опрацьовано",  get: m => m.stats.successRate, suffix: "%" },
            { label: "Розмов",       get: m => m.stats.totalConversations, suffix: "" },
            { label: "Дзвінки",      get: m => m.stats.totalCalls, suffix: "" },
            { label: "Зустрічі",     get: m => m.stats.totalMeetings, suffix: "" },
            { label: "Тренд тижня",  get: m => m.stats.weeklyTrend, suffix: "" },
          ];
          return (
            <div className="bg-card border border-primary/15 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-emerald-50 dark:bg-emerald-500/10">
                <p className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Порівняння менеджерів <span className="font-normal text-muted-foreground">({chosen.length}/{MAX_COMPARE})</span>
                </p>
                <button onClick={() => setCompareIds([])}
                  className="text-xs text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  <X className="w-3.5 h-3.5" /> Скинути
                </button>
              </div>
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${200 + chosen.length * 120}px` }}>
                  <thead>
                    <tr className="border-b border-border bg-secondary">
                      <th className="text-left py-2 px-3 font-bold text-muted-foreground uppercase text-[11px] tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Метрика</th>
                      {chosen.map(m => (
                        <th key={m.id} className="text-center py-2 px-3 font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                          {m.name.split(" ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(({ label, get, suffix, lowSampleAware }) => {
                      const values = chosen.map(get);
                      const max = Math.max(...values);
                      const lowSampleIds = lowSampleAware ? chosen.filter(m => m.stats.scoredConversations < LOW_SAMPLE_THRESHOLD).map(m => m.name.split(" ")[0]) : [];
                      return (
                        <tr key={label} className="border-b border-border last:border-0 hover:bg-secondary/20">
                          <td className="py-2.5 px-3 text-muted-foreground flex items-center gap-1.5 flex-wrap" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                            {label}
                            {lowSampleIds.length > 0 && (
                              <span title={`Мало оцінених розмов: ${lowSampleIds.join(", ")}`}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 whitespace-nowrap">
                                мало даних
                              </span>
                            )}
                          </td>
                          {values.map((v, i) => {
                            const noTrendData = label === "Тренд тижня" && !chosen[i].stats.weeklyTrendAvailable;
                            return (
                              <td key={chosen[i].id} className={cn("text-center py-2.5 px-3", !noTrendData && v === max && max > 0 ? "font-black text-primary" : "text-foreground")}
                                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                                {noTrendData ? <span className="text-muted-foreground/50" title="Ще немає даних цього тижня">—</span> : <>{v >= 0 && label === "Тренд тижня" ? "+" : ""}{v}{suffix}</>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
