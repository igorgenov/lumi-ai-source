"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";
import { BrandCheck } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";

import { Header } from "@/components/layout/header";
import { useManagers, ManagerWithStats } from "@/hooks/useManagers";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { scoreColor, scoreBarColor, cn, NEEDS_ATTENTION_THRESHOLD, SCORE_ZONES } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  Lightbulb, AlertTriangle, TrendingUp, BookOpen, Target,
  Users, MessageSquare, FileText, BarChart2, Plus,
  ChevronDown, Trash2, Pencil, Star, X, Clock, LayoutDashboard,
  Shield, Crosshair, Search, LineChart, Gem, Megaphone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker, DateRange, currentMonthRange } from "@/components/ui/date-range-picker";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────
type ProgramStatus = "not_started" | "in_progress" | "completed";
type Assignment = { id?: string; program_id: string; manager_id: string; status: ProgramStatus; assigned_at: string };
type DevelopmentPlan = {
  id?: string; manager_id: string; goal: string; deadline: string; notes: string;
  target_green_pct: number; target_yellow_pct: number; target_red_pct: number;
};
type SessionStatus = "planned" | "in_progress" | "completed";
type Session = { id: string; manager_id: string; date: string; notes: string; homework: string; next_session: string; status: SessionStatus };

// ── Constants ─────────────────────────────────────────────────────────────────
const COACHING_PROGRAMS = [
  { id: "risk-management", title: "Управління ризиками",   description: "Ідентифікація, оцінка та мінімізація ризиків у проектах.", icon: Shield,     duration: "45 хв", level: "Базовий" },
  { id: "stakeholder-comm", title: "Комунікація із стейкхолдерами",     description: "Як ефективно доносити статус проекту до замовника та команди.",      icon: Crosshair,  duration: "60 хв", level: "Середній" },
  { id: "deadline-mgmt",    title: "Управління строками",  description: "Планування, трекінг та дотримання дедлайнів у проектах.",           icon: Search,     duration: "30 хв", level: "Базовий" },
  { id: "budget-control",   title: "Контроль бюджету",    description: "Моніторинг витрат, обґрунтування змін, управління scope creep.",               icon: BarChart2,  duration: "50 хв", level: "Середній" },
  { id: "team-leadership",  title: "Лідерство в команді",      description: "Делегування, мотивація, вирішення конфліктів у проектній команді.",            icon: Gem,        duration: "40 хв", level: "Просунутий" },
  { id: "client-satisfaction", title: "Задоволеність клієнта",   description: "Збирання фідбеку, робота зі скаргами, побудова лояльності.",        icon: LineChart,  duration: "35 хв", level: "Базовий" },
];

const SCRIPTS_DATA = [
  {
    category: "Ціна — «Дорого»", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30", dot: "bg-red-400",
    scripts: [
      { title: "Порівняння з результатом", content: "«Розумію, що сума здається великою. Давайте подивимось на це як на інвестицію: наші клієнти в середньому отримують ROI 340% за 6 місяців. Тобто кожна гривня, вкладена сьогодні, повертається майже чотирма. Що для вас важливіше — зекономити зараз чи заробити більше завтра?»" },
      { title: "Декомпозиція вартості", content: "«Давайте розкладемо: 15 000 грн на місяць — це 500 грн на день. За ці гроші ви отримуєте постійний моніторинг, технічну оптимізацію, контент, посилання та звітність. Скільки коштував би ваш час, якби ви робили це самостійно?»" },
    ],
  },
  {
    category: "Відтягування — «Подумаємо»", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30", dot: "bg-amber-400",
    scripts: [
      { title: "З'ясування справжньої причини", content: "«Звичайно, розумію. Скажіть, що саме хочете обдумати? Іноді «подумаємо» означає якесь конкретне питання — хочу переконатись, що дав вам всю потрібну інформацію.»" },
      { title: "Фіксація наступного кроку", content: "«Добре. Пропоную зробити так: я надішлю вам детальний план та кейси схожих проєктів до 18:00 сьогодні. Можемо призначити короткий дзвінок на п'ятницю о 11:00, щоб відповісти на питання?»" },
    ],
  },
  {
    category: "Конкуренти — «Є інші пропозиції»", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30", dot: "bg-blue-400",
    scripts: [
      { title: "Порівняння підходів", content: "«Чудово, що розглядаєте декілька варіантів. Можете сказати, що вам сподобалось у їхній пропозиції? Це допоможе показати, чим ми відрізняємось і де наш підхід дає кращий результат саме для вашого бізнесу.»" },
      { title: "Диференціація", content: "«На ринку є багато агентств, і це добре. Inweb спеціалізується на цій послузі для бізнесів вашого типу вже 12 років. Ми готові показати 3 кейси з вашої ніші. Коли вам зручно?»" },
    ],
  },
  {
    category: "Час — «Не зараз»", color: "text-primary", bg: "bg-secondary border-border", dot: "bg-primary",
    scripts: [
      { title: "Вартість зволікання", content: "«Розумію. Дозвольте поставити одне питання: поки ми чекаємо, ваші конкуренти просуваються вперед. Через 3 місяці вони будуть вище у пошуку, а вам доведеться наздоганяти. Що змінилось би, якби ми почали зараз?»" },
      { title: "Мінімальний старт", content: "«Пропоную компроміс: розпочнемо з мінімального пакету, який не потребує великих ресурсів з вашого боку. Це дозволить нам показати результат, а ви оціните нашу роботу на практиці.»" },
    ],
  },
];

const LEVEL_COLORS: Record<string, string> = {
  "Базовий":    "bg-emerald-50 dark:bg-emerald-500/10 text-primary-hover border-emerald-200 dark:border-emerald-500/30",
  "Середній":   "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  "Просунутий": "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
};

const STATUS_META: Record<ProgramStatus, { label: string; color: string; bg: string; next: ProgramStatus | null }> = {
  not_started: { label: "Не розпочато", color: "text-muted-foreground", bg: "bg-muted border-border",    next: "in_progress" },
  in_progress:  { label: "В процесі",   color: "text-amber-700 dark:text-amber-400",        bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",  next: "completed" },
  completed:    { label: "Завершено",    color: "text-primary-hover",      bg: "bg-secondary border-border", next: null },
};

const SESSION_STATUS_META: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  planned:     { label: "Заплановано", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" },
  in_progress: { label: "В роботі",    color: "text-blue-700 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30" },
  completed:   { label: "Проведено",   color: "text-primary-hover", bg: "bg-secondary border-border" },
};

const SESSION_NOTES_LABEL = "Що обговорити";
const SESSION_NOTES_PLACEHOLDER = "Рекомендації та теми для обговорення на зустрічі...";

const TABS = [
  { id: "overview",  label: "Огляд",            icon: LayoutDashboard },
  { id: "plans",     label: "Плани розвитку",    icon: Target },
  { id: "programs",  label: "Програми навчання", icon: BookOpen },
  { id: "scripts",   label: "Скрипти",           icon: FileText },
  { id: "pdp",       label: "Зустріч PDP",        icon: MessageSquare },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Same from/to URL-param convention as /team, so the same period carries over
// (or can be compared) when navigating between the two pages.
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

function MgrAvatar({ name, size = "sm", avatarUrl }: { name: string; size?: "sm" | "md"; avatarUrl?: string | null }) {
  const sz = size === "sm" ? "w-8 h-8 text-sm" : "w-10 h-10 text-base";
  return <ManagerAvatar name={name} avatarUrl={avatarUrl} className={cn("rounded-lg shrink-0", sz)} />;
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ managers, plans, assignments, sessions, loading }: {
  managers: ManagerWithStats[];
  plans: DevelopmentPlan[];
  assignments: Assignment[];
  sessions: Session[];
  loading?: boolean;
}) {
  // One chart, two views — team average and per-manager comparison used to sit as
  // two always-visible charts (bar + multi-line) showing almost the same monthly
  // score trend, competing for attention with no clear "start here" (design
  // critique, 2026-07-30). A toggle inside one card gives the same two views
  // without the redundancy.
  const [teamChartView, setTeamChartView] = useState<"team" | "managers">("team");
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const avgScore = managers.length
    ? Math.round(managers.reduce((s, m) => s + m.stats.avgScore, 0) / managers.length)
    : 0;

  const activePlans       = plans.length;
  const inProgress        = assignments.filter(a => a.status === "in_progress").length;
  const currentMonth      = new Date().toISOString().slice(0, 7);
  const sessionsThisMonth = sessions.filter(s => s.date.startsWith(currentMonth)).length;

  // Ranking uses shrunkScore (blended toward team average by sample size) — the
  // number displayed on each row is still the real avgScore.
  const sorted = [...managers].sort((a, b) => b.stats.shrunkScore - a.stats.shrunkScore);

  const monthLabels: string[] = managers[0]?.stats.monthlyScores.map(m => m.month) ?? [];
  const monthlyTeamScores: number[] = monthLabels.map((_, i) => {
    const vals = managers
      .map(m => m.stats.monthlyScores[i]?.score ?? 0)
      .filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });
  const hasChartData = monthlyTeamScores.some(v => v > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Середній бал команди", value: avgScore || "—", sub: managers.length ? `${managers.length} менеджерів` : "немає даних", icon: TrendingUp, accent: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-50 dark:bg-emerald-500/10" },
          { label: "Активних планів",      value: activePlans,     sub: "розвитку",          icon: Target,        accent: "text-primary", iconBg: "bg-primary/8" },
          { label: "Програм в процесі",    value: inProgress,      sub: "зараз навчаються",  icon: BookOpen,      accent: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-50 dark:bg-amber-500/10" },
          { label: "Зустрічей цього місяця", value: sessionsThisMonth, sub: "PDP проведено",   icon: MessageSquare, accent: "text-blue-600 dark:text-blue-400",  iconBg: "bg-blue-50 dark:bg-blue-500/10" },
        ].map(({ label, value, sub, icon: Icon, accent, iconBg }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
              <Icon className={cn("w-5 h-5", accent)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight mb-0.5">{label}</p>
              <p className={cn("text-2xl font-black leading-none", accent)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {(() => {
        // Compares against the REAL avgScore — the same number shown on screen.
        // shrunkScore (blended toward the team average by sample size) exists only
        // to decide sort order on the leaderboard below; using it here instead let a
        // manager with a visibly lower real score go unflagged while someone with a
        // higher real score got flagged for a declining trend, with nothing on
        // screen explaining why (confirmed 2026-07-28).
        // Checks for a plan with an actual goal, not just a row — every manager now has
        // a row with the company-standard zone targets prefilled (2026-07-28), so a bare
        // existence check would silently hide this alert for everyone forever.
        const needsAction = sorted.filter(m =>
          m.stats.scoredConversations > 0 &&
          (m.stats.avgScore < NEEDS_ATTENTION_THRESHOLD || m.stats.weeklyTrend < 0) &&
          !plans.some(p => p.manager_id === m.id && p.goal.trim())
        );
        if (needsAction.length === 0) return null;
        return (
          <div className="bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-200 dark:border-amber-500/30 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Потребує дії</h3>
              <span className="text-xs text-muted-foreground ml-1">— низький бал або спадна динаміка, і ще немає плану розвитку</span>
            </div>
            <div className="divide-y divide-amber-200/60">
              {needsAction.map(mgr => {
                const lowScore = mgr.stats.avgScore < NEEDS_ATTENTION_THRESHOLD;
                const droppingTrend = mgr.stats.weeklyTrend < 0;
                return (
                <div key={mgr.id} className="flex items-center gap-4 px-5 py-3.5">
                  <MgrAvatar name={mgr.name} avatarUrl={mgr.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {mgr.stats.avgScore}/100
                      {mgr.stats.weeklyTrendAvailable && (
                        <span className={cn("ml-1.5 font-semibold", mgr.stats.weeklyTrend < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>
                          {mgr.stats.weeklyTrend > 0 ? `↑ +${mgr.stats.weeklyTrend}` : mgr.stats.weeklyTrend < 0 ? `↓ ${mgr.stats.weeklyTrend}` : "→ 0"} цього тижня
                        </span>
                      )}
                      <span className="mx-1.5">·</span>
                      {[lowScore && `бал нижче ${NEEDS_ATTENTION_THRESHOLD}`, droppingTrend && "спадна динаміка"].filter(Boolean).join(" та ")}
                      <span className="mx-1.5">·</span>
                      план розвитку: немає
                    </p>
                  </div>
                  <Link href={`/coaching/plans?manager=${mgr.id}`}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-card hover:bg-amber-100 dark:bg-amber-500/15 transition-colors"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <Target className="w-3.5 h-3.5" /> Створити план
                  </Link>
                </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Рейтинг менеджерів</h3>
          <span className="text-xs text-muted-foreground ml-1">— реальні дані з аналізу розмов</span>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-secondary/40 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Немає менеджерів</div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((mgr, idx) => {
              const needsWork = mgr.stats.avgScore > 0 && mgr.stats.avgScore < NEEDS_ATTENTION_THRESHOLD;
              const isTop = idx === 0 && mgr.stats.avgScore > 0;
              return (
                <div key={mgr.id} className={cn("flex items-center gap-4 px-5 py-3.5", needsWork && "bg-amber-50/60 dark:bg-amber-500/10")}>
                  <RankBadge rank={idx + 1} className="w-6 h-6" />
                  <MgrAvatar name={mgr.name} avatarUrl={mgr.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name}</p>
                      {mgr.position && <span className="text-xs text-muted-foreground">{mgr.position}</span>}
                      {isTop && <span className="text-xs bg-primary text-white px-1.5 py-0.5 rounded font-bold shrink-0" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Лідер</span>}
                      {needsWork && <span className="text-xs bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded font-bold shrink-0 flex items-center gap-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }} title={`Середній AI-бал нижче ${NEEDS_ATTENTION_THRESHOLD}`}><AlertTriangle className="w-3 h-3" />Потребує уваги</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[160px]">
                        <div className={cn("h-full rounded-full transition-all", mgr.stats.avgScore > 0 ? scoreBarColor(mgr.stats.avgScore) : "bg-secondary")}
                          style={{ width: `${mgr.stats.avgScore}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{mgr.stats.totalConversations} розмов</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {mgr.stats.avgScore > 0 ? (
                      <>
                        <span className={cn("text-xl font-black", scoreColor(mgr.stats.avgScore))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.stats.avgScore}</span>
                        <p className="text-xs text-muted-foreground">/100</p>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground/50" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team dynamics — one card, two views (team average / per-manager comparison)
          instead of two separate charts of the same monthly score trend competing
          for attention (design critique, 2026-07-30). */}
      {(() => {
        const lastIdx = monthlyTeamScores.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
        const lastVal = lastIdx.length ? monthlyTeamScores[lastIdx[lastIdx.length - 1]] : 0;
        const prevVal = lastIdx.length > 1 ? monthlyTeamScores[lastIdx[lastIdx.length - 2]] : 0;
        const trendDelta = lastVal > 0 && prevVal > 0 ? lastVal - prevVal : null;
        // Same visual language as the single-manager ScoreChart on /team/[id] —
        // gradient area fill, dashed empty-month dots, dark hover tooltip — instead
        // of a plain bar chart, so the two pages read as one consistent product
        // rather than two different chart styles for the same "AI score over time"
        // idea (explicit request, 2026-07-30).
        const CW = 900, CH = 180, CPX = 36, CPY = 16, CBOT = 28;
        const cDataH = CH - CPY - CBOT;
        const nMonths = monthLabels.length;
        const toX = (i: number) => CPX + (nMonths > 1 ? i * (CW - 2 * CPX) / (nMonths - 1) : (CW - 2 * CPX) / 2);
        const toY = (v: number) => CPY + (1 - v / 100) * cDataH;

        const teamRealPts = monthlyTeamScores
          .map((v, i) => v > 0 ? { i, x: toX(i), y: toY(v) } : null)
          .filter(Boolean) as { i: number; x: number; y: number }[];
        let teamLinePath = "", teamFillPath = "";
        if (teamRealPts.length >= 2) {
          teamLinePath = teamRealPts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          teamFillPath = teamLinePath
            + ` L${teamRealPts[teamRealPts.length - 1].x.toFixed(1)},${CH - CBOT}`
            + ` L${teamRealPts[0].x.toFixed(1)},${CH - CBOT} Z`;
        }

        const MGR_COLORS = ["#003B29","#EF583D","#10b981","#f59e0b","#ef4444","#ec4899"];
        const hasLineData = sorted.some(m => m.stats.monthlyScores.some(s => s.score > 0));

        return (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <BarChart2 className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Динаміка балів</h3>
              <span className="text-xs text-muted-foreground ml-1">— останні 6 місяців</span>
              {teamChartView === "team" && trendDelta !== null && (
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                  trendDelta > 0 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : trendDelta < 0 ? "bg-red-50 dark:bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"
                )}>
                  {trendDelta > 0 ? `↑ +${trendDelta}` : trendDelta < 0 ? `↓ ${trendDelta}` : "→ 0"} vs минулий місяць
                </span>
              )}
              <div className="ml-auto flex items-center gap-1 bg-secondary/40 rounded-lg p-0.5">
                {([
                  { key: "team" as const, label: "Команда" },
                  { key: "managers" as const, label: "По менеджерах" },
                ]).map(v => (
                  <button key={v.key} onClick={() => setTeamChartView(v.key)}
                    className={cn("px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                      teamChartView === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {teamChartView === "team" ? (
              !hasChartData ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <BarChart2 className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Даних ще немає</p>
                  <p className="text-xs text-muted-foreground/60">Графік з'явиться після того як AI проаналізує розмови</p>
                </div>
              ) : (
                <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full mt-3" overflow="visible">
                  <defs>
                    <linearGradient id="teamGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#003B29" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#003B29" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 25, 50, 75, 100].map(v => (
                    <g key={v}>
                      <line x1={CPX} y1={toY(v)} x2={CW - CPX} y2={toY(v)}
                        stroke="#E5E7EB" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "4 4"} />
                      <text x={CPX - 6} y={toY(v) + 4} fontSize="11" fill="#6B7280" textAnchor="end" fontFamily="var(--font-geist-sans), sans-serif">{v}</text>
                    </g>
                  ))}
                  {teamFillPath && <path d={teamFillPath} fill="url(#teamGrad)" />}
                  {teamLinePath && <path d={teamLinePath} fill="none" stroke="#003B29" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                  {monthlyTeamScores.map((v, i) => {
                    const x = toX(i);
                    const hasScore = v > 0;
                    const y = hasScore ? toY(v) : CPY + cDataH / 2;
                    const isH = hoveredMonth === i;
                    return (
                      <g key={i} onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>
                        {hasScore ? (
                          <circle cx={x} cy={y} r={isH ? 6 : 4} fill="#003B29" stroke="white" strokeWidth="2" />
                        ) : (
                          <circle cx={x} cy={y} r={4} fill="white" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="3 2" />
                        )}
                        <rect x={x - 28} y={0} width={56} height={CH} fill="transparent" style={{ cursor: hasScore ? "crosshair" : "default" }} />
                        {isH && hasScore && (
                          <g>
                            <rect x={x - 28} y={y - 36} width={56} height={28} rx="6" fill="#1C1C1C" />
                            <text x={x} y={y - 22} fontSize="11" fill="#FF8B72" textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight="900">{v}</text>
                            <text x={x} y={y - 11} fontSize="9" fill="#CBD5E1" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">{monthLabels[i]}</text>
                          </g>
                        )}
                        {isH && !hasScore && (
                          <g>
                            <rect x={x - 36} y={y - 30} width={72} height={20} rx="5" fill="#6B7280" />
                            <text x={x} y={y - 17} fontSize="9" fill="white" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">Немає даних</text>
                          </g>
                        )}
                        <text x={x} y={CH - 8} textAnchor="middle" fontSize="11" fontFamily="var(--font-unbounded), sans-serif"
                          fontWeight={isH ? "700" : "400"} fill={isH ? "#003B29" : hasScore ? "#6B7280" : "#D1D5DB"}>
                          {monthLabels[i]}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )
            ) : (
              !hasLineData ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <BarChart2 className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Даних ще немає</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 mb-3 mt-3">
                    {sorted.map((m, mi) => {
                      const color = MGR_COLORS[mi % MGR_COLORS.length];
                      const scores = m.stats.monthlyScores;
                      const last = [...scores].reverse().find(s => s.score > 0)?.score ?? 0;
                      const prev = [...scores].slice(0, -1).reverse().find(s => s.score > 0)?.score ?? 0;
                      const delta = last > 0 && prev > 0 ? last - prev : null;
                      return (
                        <div key={m.id} className="flex items-center gap-1.5">
                          <span className="w-8 h-0.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            {m.name.split(" ")[0]}
                          </span>
                          {last > 0 && <span className={cn("text-xs font-black", scoreColor(last))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{last}</span>}
                          {delta !== null && (
                            <span className={cn("text-[10px]", delta > 0 ? "text-emerald-500" : delta < 0 ? "text-red-400" : "text-muted-foreground")}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" overflow="visible">
                    {[0, 25, 50, 75, 100].map(v => (
                      <g key={v}>
                        <line x1={CPX} y1={toY(v)} x2={CW - CPX} y2={toY(v)}
                          stroke="#E5E7EB" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "4 4"} />
                        <text x={CPX - 6} y={toY(v) + 4} textAnchor="end" fontSize="11" fill="#6B7280" fontFamily="var(--font-geist-sans), sans-serif">{v}</text>
                      </g>
                    ))}
                    {sorted.map((m, mi) => {
                      const color = MGR_COLORS[mi % MGR_COLORS.length];
                      const pts = m.stats.monthlyScores.map((s, i) => ({
                        x: toX(i), y: s.score > 0 ? toY(s.score) : null, v: s.score,
                      }));
                      const validPts = pts.filter(p => p.y !== null) as { x: number; y: number; v: number }[];
                      if (validPts.length === 0) return null;
                      const path = validPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
                      return (
                        <g key={m.id}>
                          <path d={path} fill="none" stroke={color} strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round" />
                          {pts.map((p, i) => (
                            p.y !== null ? (
                              <circle key={i} cx={p.x} cy={p.y} r={hoveredMonth === i ? 6 : 4} fill={color} stroke="white" strokeWidth="2" />
                            ) : (
                              <circle key={i} cx={p.x} cy={CPY + cDataH / 2} r={4} fill="white" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="3 2" />
                            )
                          ))}
                        </g>
                      );
                    })}
                    {monthLabels.map((lbl, i) => {
                      const x = toX(i);
                      const isH = hoveredMonth === i;
                      const rows = sorted
                        .map((m, mi) => ({ name: m.name.split(" ")[0], v: m.stats.monthlyScores[i]?.score ?? 0, color: MGR_COLORS[mi % MGR_COLORS.length] }))
                        .filter(r => r.v > 0);
                      return (
                        <g key={i} onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}>
                          <rect x={x - 28} y={0} width={56} height={CH} fill="transparent" style={{ cursor: rows.length ? "crosshair" : "default" }} />
                          {isH && rows.length > 0 && (
                            <g>
                              <rect x={Math.min(Math.max(x - 44, 4), CW - 92)} y={4} width={88} height={16 + rows.length * 14} rx="6" fill="#1C1C1C" />
                              <text x={Math.min(Math.max(x - 44, 4), CW - 92) + 44} y={16} fontSize="9" fill="#CBD5E1" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">{lbl}</text>
                              {rows.map((r, ri) => (
                                <g key={r.name}>
                                  <circle cx={Math.min(Math.max(x - 44, 4), CW - 92) + 10} cy={28 + ri * 14} r="3" fill={r.color} />
                                  <text x={Math.min(Math.max(x - 44, 4), CW - 92) + 18} y={31 + ri * 14} fontSize="10" fill="white" fontFamily="var(--font-geist-sans), sans-serif">{r.name}</text>
                                  <text x={Math.min(Math.max(x - 44, 4), CW - 92) + 80} y={31 + ri * 14} fontSize="10" fontWeight="900" fill="#FF8B72" textAnchor="end" fontFamily="var(--font-unbounded), sans-serif">{r.v}</text>
                                </g>
                              ))}
                            </g>
                          )}
                          <text x={x} y={CH - 8} textAnchor="middle" fontSize="11" fontFamily="var(--font-unbounded), sans-serif"
                            fontWeight={isH ? "700" : "400"} fill={isH ? "#003B29" : "#6B7280"}>{lbl}</text>
                        </g>
                      );
                    })}
                  </svg>
                </>
              )
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Plans tab ─────────────────────────────────────────────────────────────────
function PlansTab({ managers, plans, onSavePlan, onDeletePlan, focusManagerId, canEdit }: {
  managers: ManagerWithStats[];
  plans: DevelopmentPlan[];
  onSavePlan: (p: DevelopmentPlan) => Promise<void>;
  onDeletePlan: (managerId: string) => Promise<void>;
  focusManagerId?: string | null;
  canEdit: boolean;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(() => (canEdit ? focusManagerId ?? null : null));
  const [saved, setSaved] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusManagerId) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePlan(p: DevelopmentPlan) {
    await onSavePlan(p);
    setEditing(null);
    setSaved(p.manager_id);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-bold text-foreground mb-2.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Що означають зони</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCORE_ZONES.map(zone => (
            <div key={zone.value} className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: zone.hex }} />
              <div>
                <p className="text-xs font-semibold text-foreground">{zone.label} <span className="font-normal text-muted-foreground">({zone.range} балів)</span></p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{zone.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {managers.map(mgr => {
          const plan = plans.find(p => p.manager_id === mgr.id);
          const isEditing = editing === mgr.id;
          const daysLeft = plan?.deadline ? Math.ceil((parseLocalDate(plan.deadline).getTime() - Date.now()) / 86400000) : null;
          const total = mgr.stats.scoredConversations;
          const distByZone = Object.fromEntries(mgr.stats.scoreDistribution.map(d => [d.range, d.count]));

          return (
            <div key={mgr.id} ref={mgr.id === focusManagerId ? focusRef : undefined}
              className={cn("bg-card border rounded-xl p-5", mgr.id === focusManagerId ? "border-primary/40 ring-2 ring-primary/15" : "border-border")}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <MgrAvatar name={mgr.name} size="md" avatarUrl={mgr.avatar_url} />
                  <div>
                    <p className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name}</p>
                    <p className="text-xs text-muted-foreground">{mgr.position ?? ""}</p>
                  </div>
                </div>
                {saved === mgr.id && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><BrandCheck className="w-3 h-3" />Збережено</span>}
              </div>

              {plan && !isEditing ? (
                <>
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-foreground">{plan.goal || "Ціль не вказана"}</span>
                      {daysLeft !== null && (
                        <span className={cn("flex items-center gap-1 text-muted-foreground shrink-0 ml-2", daysLeft < 14 ? "text-amber-600 dark:text-amber-400" : "")}>
                          <Clock className="w-3 h-3" />{daysLeft > 0 ? `${daysLeft} дн.` : "Прострочено"}
                        </span>
                      )}
                    </div>
                    {/* Actual vs target share of scored conversations per zone — replaces the
                        old single "current score → target score" bar, which said nothing about
                        WHICH conversations should improve, just an average a few great calls
                        could mask many mediocre ones behind. */}
                    <div className="space-y-1.5">
                      {SCORE_ZONES.map(zone => {
                        // Yellow has no target of its own — it's whatever's left once
                        // red shrinks and green grows, not something to independently
                        // aim for (see ZONE_TARGET in lib/utils.ts).
                        const targetPct = zone.value === "green" ? plan.target_green_pct
                          : zone.value === "red" ? plan.target_red_pct : null;
                        const actualPct = total > 0 ? Math.round(((distByZone[zone.value] ?? 0) / total) * 100) : 0;
                        return (
                          <div key={zone.value} className="flex items-center gap-2">
                            <span className="text-[10px] w-12 shrink-0 flex items-center gap-1 text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: zone.hex }} />
                              {zone.label}
                            </span>
                            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden relative">
                              <div className={cn("h-full rounded-full transition-all", zone.bar)} style={{ width: `${actualPct}%` }} />
                              {targetPct != null && (
                                <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/30" style={{ left: `${targetPct}%` }}
                                  title={`Ціль: ${targetPct}%`} />
                              )}
                            </div>
                            <span className="text-[10px] w-20 text-right shrink-0 text-muted-foreground">
                              {actualPct}% {targetPct != null && `/ ${targetPct}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {plan.notes && <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2.5 mb-3 border border-border whitespace-pre-line">{plan.notes}</p>}
                  {canEdit && (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditing(mgr.id)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                        <Pencil className="w-3 h-3" /> Редагувати план
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Видалити план розвитку?",
                            description: `План «${plan.goal}» для ${mgr.name} буде видалено без можливості відновити.`,
                          });
                          if (ok) onDeletePlan(mgr.id);
                        }}
                        className="text-xs text-red-400 flex items-center gap-1 hover:underline">
                        <Trash2 className="w-3 h-3" /> Видалити
                      </button>
                    </div>
                  )}
                </>
              ) : canEdit && isEditing ? (
                <PlanForm
                  plan={plan ?? { manager_id: mgr.id, goal: "", target_green_pct: 20, target_yellow_pct: 65, target_red_pct: 15, deadline: "", notes: "" }}
                  onSave={savePlan}
                  onCancel={() => setEditing(null)}
                />
              ) : canEdit ? (
                <button onClick={() => setEditing(mgr.id)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-primary/30 rounded-lg text-xs text-primary hover:bg-secondary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Додати план розвитку
                </button>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">План розвитку ще не задано.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanForm({ plan, onSave, onCancel }: { plan: DevelopmentPlan; onSave: (p: DevelopmentPlan) => void; onCancel: () => void }) {
  const [form, setForm] = useState(plan);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // Only red/green are ever actively targeted — fewer bad calls, more good ones is the
  // whole point. Yellow is always the leftover, computed here instead of asked for, so
  // there's nothing to "balance to 100%" by hand and no way to enter an inconsistent set.
  const yellowPct = Math.max(0, 100 - form.target_green_pct - form.target_red_pct);

  async function suggestGoal() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/coaching/suggest-goal?managerId=${form.manager_id}`);
      const data = await res.json();
      if (!res.ok) { setSuggestError(data.error ?? "Не вдалося підказати ціль"); return; }
      if (!data.goal && !data.notes) { setSuggestError(data.reason ?? "Недостатньо даних для підказки"); return; }
      // Ціль лишається короткою (одна найчастіша слабкість), а Нотатки заповнюємо повним
      // розбором усіх слабких критеріїв та зауважень AI — щоб не губити картину, коли у
      // менеджера багато різних точок росту, а не одна повторювана.
      setForm(f => ({
        ...f,
        goal: data.goal ?? f.goal,
        notes: data.notes ?? f.notes,
      }));
    } catch {
      setSuggestError("Мережева помилка");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground block">Ціль</label>
          <button type="button" onClick={suggestGoal} disabled={suggesting}
            className="text-[11px] text-primary hover:underline disabled:opacity-40 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />{suggesting ? "Аналізуємо…" : "Підказати з реальних розмов"}
          </button>
        </div>
        <input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
          placeholder="Наприклад: Покращити закриття угод"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
        {suggestError && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{suggestError}</p>}
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Ціль по зонах — менше поганих, більше гарних</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SCORE_ZONES[0].hex }} />
              Червона — не більше
            </label>
            <div className="relative">
              <input type="number" min={0} max={100} value={form.target_red_pct}
                onChange={e => setForm(f => ({ ...f, target_red_pct: Number(e.target.value) }))}
                className="w-full px-2 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SCORE_ZONES[2].hex }} />
              Зелена — не менше
            </label>
            <div className="relative">
              <input type="number" min={0} max={100} value={form.target_green_pct}
                onChange={e => setForm(f => ({ ...f, target_green_pct: Number(e.target.value) }))}
                className="w-full px-2 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SCORE_ZONES[1].hex }} />
              Жовта — залишок
            </label>
            <div className="relative">
              <input type="number" value={yellowPct} disabled
                className="w-full px-2 py-2 text-sm border border-border rounded-lg bg-secondary/40 text-muted-foreground cursor-not-allowed" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Дедлайн</label>
        <DatePicker value={form.deadline} onChange={iso => setForm(f => ({ ...f, deadline: iso }))} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Нотатки</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={form.notes.length > 150 ? 8 : 2}
          placeholder="Фокусні зони, контекст..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ ...form, target_yellow_pct: yellowPct })} disabled={!form.goal || !form.deadline}
          className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-40"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Зберегти план</button>
        <button onClick={onCancel} className="px-3 py-2 border border-border text-muted-foreground rounded-lg hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Programs tab ──────────────────────────────────────────────────────────────
function ProgramsTab({ managers, assignments, onAssign, onUnassign, onUpdateStatus, canEdit }: {
  managers: ManagerWithStats[];
  assignments: Assignment[];
  onAssign: (programId: string, managerId: string) => Promise<void>;
  onUnassign: (programId: string, managerId: string) => Promise<void>;
  onUpdateStatus: (programId: string, managerId: string, status: ProgramStatus) => Promise<void>;
  canEdit: boolean;
}) {
  const confirm = useConfirm();
  const [assigning, setAssigning] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {COACHING_PROGRAMS.map(program => {
        const progAssignments = assignments.filter(a => a.program_id === program.id);
        const isAssigning = assigning === program.id;

        return (
          <div key={program.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                <program.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{program.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded border", LEVEL_COLORS[program.level])} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    {program.level}
                  </span>
                  <span className="text-xs text-muted-foreground">{program.duration}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-4">{program.description}</p>

            <div className="flex-1 space-y-2 mb-3">
              {progAssignments.length === 0 && (
                <p className="text-xs text-muted-foreground">Ніхто не призначений</p>
              )}
              {progAssignments.map(a => {
                const mgr = managers.find(m => m.id === a.manager_id);
                if (!mgr) return null;
                const meta = STATUS_META[a.status];
                return (
                  <div key={a.manager_id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MgrAvatar name={mgr.name} avatarUrl={mgr.avatar_url} />
                      <span className="text-xs font-semibold text-foreground truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name.split(" ")[0]}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => canEdit && meta.next && onUpdateStatus(program.id, a.manager_id, meta.next)}
                        disabled={!canEdit}
                        className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors", meta.bg, meta.color,
                          canEdit && meta.next ? "cursor-pointer hover:opacity-80" : "cursor-default"
                        )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {a.status === "completed" ? <BrandCheck className="w-3 h-3 inline mr-1" /> : null}{meta.label}
                      </button>
                      {canEdit && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Зняти призначення програми?",
                              description: `${mgr.name} більше не буде проходити «${program.title}» — прогрес по цій програмі буде втрачено.`,
                            });
                            if (ok) onUnassign(program.id, a.manager_id);
                          }}
                          className="text-muted-foreground hover:text-red-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!canEdit ? null : isAssigning ? (
              <div className="border border-border rounded-lg p-2 space-y-1">
                {managers.filter(m => !progAssignments.some(a => a.manager_id === m.id)).map(m => (
                  <button key={m.id} onClick={() => { onAssign(program.id, m.id); setAssigning(null); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left">
                    <MgrAvatar name={m.name} avatarUrl={m.avatar_url} />
                    <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{m.name}</span>
                  </button>
                ))}
                <button onClick={() => setAssigning(null)} className="w-full text-xs text-muted-foreground py-1 hover:text-primary transition-colors">Скасувати</button>
              </div>
            ) : (
              <button onClick={() => setAssigning(program.id)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mt-auto">
                <Plus className="w-3.5 h-3.5" /> Призначити менеджеру
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Scripts tab ───────────────────────────────────────────────────────────────
function ScriptsTab() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  function toggle(key: string) { setExpanded(e => ({ ...e, [key]: !e[key] })); }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-secondary border border-border rounded-xl">
        <Lightbulb className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs text-foreground">Готові скрипти для типових ситуацій продажу. Натисніть щоб розгорнути, скопіюйте і адаптуйте під свій стиль.</p>
      </div>

      {SCRIPTS_DATA.map(cat => (
        <div key={cat.category} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className={cn("px-5 py-3 border-b border-border flex items-center gap-2", cat.bg)}>
            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", cat.dot)} />
            <h3 className={cn("text-sm font-bold", cat.color)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{cat.category}</h3>
            <span className="text-xs text-muted-foreground ml-1">{cat.scripts.length} скрипти</span>
          </div>
          <div className="p-4 space-y-3">
            {cat.scripts.map((script, si) => {
              const key = `${cat.category}-${si}`;
              const isOpen = expanded[key];
              return (
                <div key={si} className="border border-border rounded-lg overflow-hidden">
                  <button onClick={() => toggle(key)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors text-left">
                    <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{script.title}</span>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-foreground leading-relaxed bg-muted rounded-lg p-3 border border-border italic">{script.content}</p>
                      <button onClick={() => copy(script.content, key)}
                        className={cn(
                          "mt-2 flex items-center gap-1.5 text-xs font-medium transition-colors",
                          copied === key ? "text-emerald-600 dark:text-emerald-400" : "text-primary hover:underline"
                        )}>
                        {copied === key ? <><BrandCheck className="w-3 h-3" />Скопійовано</> : "Скопіювати скрипт"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sessions tab ──────────────────────────────────────────────────────────────
function SessionsTab({ managers, sessions, onAdd, onDelete, onUpdate, currentUserRole }: {
  managers: ManagerWithStats[];
  sessions: Session[];
  onAdd: (s: Omit<Session, "id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<Session, "notes" | "homework" | "next_session" | "status">>) => Promise<boolean>;
  currentUserRole: string;
}) {
  const canEditStatus = currentUserRole === "owner" || currentUserRole === "admin";
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mgrFilter, setMgrFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ notes: "", homework: "", next_session: "" });
  const [statusErrorId, setStatusErrorId] = useState<string | null>(null);

  async function changeStatus(id: string, status: SessionStatus) {
    setStatusErrorId(null);
    const ok = await onUpdate(id, { status });
    if (!ok) setStatusErrorId(id);
  }
  const [newSession, setNewSession] = useState<Omit<Session, "id">>({
    manager_id: managers[0]?.id ?? "", date: "", notes: "", homework: "", next_session: "", status: "completed",
  });

  async function addSession() {
    setSaving(true);
    await onAdd(newSession);
    setSaving(false);
    setAdding(false);
    setNewSession({ manager_id: managers[0]?.id ?? "", date: "", notes: "", homework: "", next_session: "", status: "completed" });
  }

  function startEdit(session: Session) {
    setEditingId(session.id);
    setDraft({ notes: session.notes, homework: session.homework, next_session: session.next_session ?? "" });
  }

  async function saveEdit(id: string) {
    await onUpdate(id, draft);
    setEditingId(null);
  }

  const filtered = mgrFilter === "all" ? sessions : sessions.filter(s => s.manager_id === mgrFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {[{ value: "all", label: "Всі менеджери" }, ...managers.map(m => ({ value: m.id, label: m.name.split(" ")[0] }))].map(opt => (
            <button key={opt.value} onClick={() => setMgrFilter(opt.value)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors", mgrFilter === opt.value ? "bg-accent text-white border-accent" : "bg-card border-border text-muted-foreground hover:border-primary/30")}
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {opt.label}
            </button>
          ))}
        </div>
        {canEditStatus && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover transition-colors shrink-0"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Plus className="w-4 h-4" /> Нова зустріч
          </button>
        )}
      </div>

      {canEditStatus && adding && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Нова зустріч PDP</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Менеджер</label>
              <select value={newSession.manager_id} onChange={e => setNewSession(s => ({ ...s, manager_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground">
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Дата зустрічі</label>
              <DatePicker value={newSession.date} onChange={iso => setNewSession(s => ({ ...s, date: iso }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{SESSION_NOTES_LABEL}</label>
            <textarea value={newSession.notes} onChange={e => setNewSession(s => ({ ...s, notes: e.target.value }))} rows={3}
              placeholder={SESSION_NOTES_PLACEHOLDER}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none bg-card text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Домашнє завдання</label>
            <input value={newSession.homework} onChange={e => setNewSession(s => ({ ...s, homework: e.target.value }))}
              placeholder="Що менеджер має зробити до наступної зустрічі..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Наступна зустріч</label>
            <DatePicker value={newSession.next_session} onChange={iso => setNewSession(s => ({ ...s, next_session: iso }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addSession} disabled={!newSession.date || !newSession.notes || saving}
              className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover disabled:opacity-40 transition-colors"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{saving ? "Збереження..." : "Зберегти зустріч"}</button>
            <button onClick={() => setAdding(false)} className="px-3 py-2 border border-border text-muted-foreground rounded-lg hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !adding && (
        <div className="text-center py-12 text-muted-foreground text-sm">Немає записаних зустрічей</div>
      )}

      <div className="space-y-3">
        {filtered.map(session => {
          const mgr = managers.find(m => m.id === session.manager_id);
          const nextDate = session.next_session ? parseLocalDate(session.next_session) : null;
          const daysUntil = nextDate && !isNaN(nextDate.getTime()) ? Math.ceil((startOfDay(nextDate).getTime() - startOfDay(new Date()).getTime()) / 86400000) : null;
          const meta = SESSION_STATUS_META[session.status ?? "planned"];
          const isEditing = editingId === session.id;

          return (
            <div key={session.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {mgr && <MgrAvatar name={mgr.name} size="md" avatarUrl={mgr.avatar_url} />}
                  <div>
                    <p className="font-bold text-foreground text-sm" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Дата зустрічі: {session.date ? parseLocalDate(session.date).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative" title={canEditStatus ? undefined : "Змінювати статус може лише адміністратор"}>
                    <select
                      value={session.status ?? "planned"}
                      disabled={!canEditStatus}
                      onChange={e => changeStatus(session.id, e.target.value as SessionStatus)}
                      className={cn(
                        "appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 rounded-full border transition-colors focus:outline-none",
                        meta.bg, meta.color, canEditStatus ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                      )}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <option value="planned">Заплановано</option>
                      <option value="in_progress">В роботі</option>
                      <option value="completed">Проведено</option>
                    </select>
                    <ChevronDown className={cn("w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none", meta.color)} />
                  </div>
                  {canEditStatus && (
                    <>
                      <button onClick={() => isEditing ? setEditingId(null) : startEdit(session)} className="text-muted-foreground hover:text-primary transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Видалити цю зустріч?",
                            description: `Зустріч з ${mgr?.name ?? "менеджером"} (${session.date}) разом з нотатками та домашнім завданням буде видалено без можливості відновити.`,
                          });
                          if (ok) onDelete(session.id);
                        }}
                        className="text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {statusErrorId === session.id && (
                <p className="text-xs text-red-600 dark:text-red-400 -mt-2 mb-3">Не вдалося змінити статус. Спробуйте ще раз або зверніться до адміністратора.</p>
              )}

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{SESSION_NOTES_LABEL}</label>
                    <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={5}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none bg-card text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Домашнє завдання</label>
                    <input value={draft.homework} onChange={e => setDraft(d => ({ ...d, homework: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Наступна зустріч</label>
                    <DatePicker value={draft.next_session} onChange={iso => setDraft(d => ({ ...d, next_session: iso }))} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(session.id)}
                      className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Зберегти</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-2 border border-border text-muted-foreground rounded-lg hover:bg-secondary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-muted border border-border rounded-lg p-3">
                      <p className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        <MessageSquare className="w-3 h-3" /> {SESSION_NOTES_LABEL}
                      </p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{session.notes}</p>
                    </div>
                    <div className="bg-secondary border border-border rounded-lg p-3">
                      <p className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        <Star className="w-3 h-3" /> Домашнє завдання
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">{session.homework || "—"}</p>
                    </div>
                  </div>

                  {session.next_session && nextDate && !isNaN(nextDate.getTime()) && daysUntil !== null && (
                    <div className={cn(
                      "mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
                      daysUntil < 0 ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30" : "bg-secondary text-primary border-border"
                    )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <Clock className="w-3 h-3" />
                      Наступна зустріч: {nextDate.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
                      {daysUntil > 0 && ` (через ${daysUntil} дн.)`}
                      {daysUntil === 0 && " (сьогодні)"}
                      {daysUntil < 0 && ` (прострочено на ${Math.abs(daysUntil)} дн.)`}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TAB_IDS = TABS.map(t => t.id);

export default function CoachingPage({ params }: { params: { tab: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep link from a manager's card on /team ("Створити план коучингу") — opens the plan
  // form for that manager pre-focused instead of making the user find their card again.
  const focusManagerId = searchParams.get("manager");
  const [activeTab, setActiveTab] = useState(() =>
    TAB_IDS.includes(params.tab) ? params.tab : "overview"
  );

  // Same from/to URL convention as /team — was previously hardcoded to
  // currentMonthRange() with no way to change it and nothing on screen saying so,
  // which is exactly why the same manager's score could read differently here vs
  // /team with no visible explanation (confirmed 2026-07-28).
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const from = parseDateParam(searchParams.get("from"));
    const to = parseDateParam(searchParams.get("to"));
    return from || to ? { from, to } : currentMonthRange();
  });
  useEffect(() => {
    const params2 = new URLSearchParams(searchParams.toString());
    if (dateRange.from) params2.set("from", fmtDateParam(dateRange.from)); else params2.delete("from");
    if (dateRange.to) params2.set("to", fmtDateParam(dateRange.to)); else params2.delete("to");
    const qs = params2.toString();
    router.replace(qs ? `/coaching/${activeTab}?${qs}` : `/coaching/${activeTab}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // [tab] is a shared dynamic segment, so Next.js reuses this component instance across
  // /coaching/plans <-> /coaching/scripts instead of remounting it — the state initializer
  // above only runs once, so browser back/forward and direct links need this to stay in sync.
  useEffect(() => {
    if (TAB_IDS.includes(params.tab) && params.tab !== activeTab) setActiveTab(params.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);

  // Keep the URL in sync so a specific tab (e.g. Скрипти, Зустріч PDP) can be shared directly.
  function selectTab(id: string) {
    setActiveTab(id);
    router.replace(`/coaching/${id}`, { scroll: false });
  }

  const { data: sessionData } = useSession();
  const currentUserRole = useEffectiveRole();
  const currentUserEmail = sessionData?.user?.email ?? "";
  const { managers: allManagers, loading: managersLoading } = useManagers(dateRange);
  const managers = allManagers.filter(m => m.role === "pm");

  // For pm role: find their own manager record
  const currentManager = currentUserRole === "pm"
    ? managers.find(m => m.email === currentUserEmail) ?? null
    : null;
  const currentManagerId = currentManager?.id ?? null;

  // Managers visible in tab dropdowns — pm sees only themselves
  const visibleManagers = currentManagerId
    ? managers.filter(m => m.id === currentManagerId)
    : managers;

  const [allPlans, setAllPlans] = useState<DevelopmentPlan[]>([]);
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);

  // Filter data by current manager if role is manager
  const plans = currentManagerId
    ? allPlans.filter(p => p.manager_id === currentManagerId)
    : allPlans;
  const assignments = currentManagerId
    ? allAssignments.filter(a => a.manager_id === currentManagerId)
    : allAssignments;
  const sessions = currentManagerId
    ? allSessions.filter(s => s.manager_id === currentManagerId)
    : allSessions;

  const fetchAll = useCallback(async () => {
    const [plansRes, assignRes, sessRes] = await Promise.all([
      fetch("/api/coaching/plans"),
      fetch("/api/coaching/assignments"),
      fetch("/api/coaching/sessions"),
    ]);
    if (plansRes.ok)  { const d = await plansRes.json();  setAllPlans(d.plans ?? []); }
    if (assignRes.ok) { const d = await assignRes.json(); setAllAssignments(d.assignments ?? []); }
    if (sessRes.ok)   { const d = await sessRes.json();   setAllSessions(d.sessions ?? []); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Plans handlers
  async function handleSavePlan(p: DevelopmentPlan) {
    await fetch("/api/coaching/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        managerId: p.manager_id, goal: p.goal,
        targetGreenPct: p.target_green_pct, targetYellowPct: p.target_yellow_pct, targetRedPct: p.target_red_pct,
        deadline: p.deadline, notes: p.notes,
      }),
    });
    await fetchAll();
  }

  async function handleDeletePlan(managerId: string) {
    setAllPlans(prev => prev.filter(p => p.manager_id !== managerId));
    await fetch("/api/coaching/plans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId }),
    });
  }

  // Assignment handlers
  async function handleAssign(programId: string, managerId: string) {
    const optimistic: Assignment = { program_id: programId, manager_id: managerId, status: "not_started", assigned_at: new Date().toISOString().slice(0, 10) };
    setAllAssignments(prev => [...prev, optimistic]);
    await fetch("/api/coaching/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, managerId }),
    });
    await fetchAll();
  }

  async function handleUnassign(programId: string, managerId: string) {
    setAllAssignments(prev => prev.filter(a => !(a.program_id === programId && a.manager_id === managerId)));
    await fetch("/api/coaching/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, managerId }),
    });
  }

  async function handleUpdateStatus(programId: string, managerId: string, status: ProgramStatus) {
    setAllAssignments(prev => prev.map(a =>
      a.program_id === programId && a.manager_id === managerId ? { ...a, status } : a
    ));
    await fetch("/api/coaching/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, managerId, status }),
    });
  }

  // Session handlers
  async function handleAddSession(s: Omit<Session, "id">) {
    await fetch("/api/coaching/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: s.manager_id, date: s.date, notes: s.notes, homework: s.homework, nextSession: s.next_session }),
    });
    await fetchAll();
  }

  async function handleDeleteSession(id: string) {
    setAllSessions(prev => prev.filter(s => s.id !== id));
    await fetch("/api/coaching/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // Applies the change locally only after the server confirms it — a failed PATCH
  // (e.g. a status value the DB doesn't accept yet) must not flash a value on screen
  // that was never actually saved, since that reads as "it randomly reverted".
  async function handleUpdateSession(id: string, patch: Partial<Pick<Session, "notes" | "homework" | "next_session" | "status">>): Promise<boolean> {
    const res = await fetch("/api/coaching/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: patch.notes, homework: patch.homework, nextSession: patch.next_session, status: patch.status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.error("[coaching] session update failed:", d.error);
      return false;
    }
    setAllSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    return true;
  }

  return (
    <div>
      <Header title="AI Коучинг" subtitle="Рекомендації та розвиток команди на основі аналізу розмов"
        actions={<DateRangePicker value={dateRange} onChange={setDateRange} align="right" />} />

      <div className="px-6 pt-4 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => selectTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-primary"
              )} style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === "overview" && (
          <OverviewTab managers={visibleManagers} plans={plans} assignments={assignments} sessions={sessions} loading={managersLoading} />
        )}
        {activeTab === "plans" && (
          <PlansTab managers={visibleManagers} plans={plans} onSavePlan={handleSavePlan} onDeletePlan={handleDeletePlan} focusManagerId={focusManagerId}
            canEdit={currentUserRole === "owner" || currentUserRole === "admin"} />
        )}
        {activeTab === "programs" && (
          <ProgramsTab managers={visibleManagers} assignments={assignments}
            onAssign={handleAssign} onUnassign={handleUnassign} onUpdateStatus={handleUpdateStatus}
            canEdit={currentUserRole === "owner" || currentUserRole === "admin"} />
        )}
        {activeTab === "scripts" && <ScriptsTab />}
        {activeTab === "pdp" && (
          <SessionsTab managers={visibleManagers} sessions={sessions} onAdd={handleAddSession} onDelete={handleDeleteSession} onUpdate={handleUpdateSession} currentUserRole={currentUserRole} />
        )}
      </div>
    </div>
  );
}
