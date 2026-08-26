"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import {
  scoreColor, scoreBarColor, cn, generateSlug, countsTowardAiScore, stripAgencyPrefix,
  formatDate, formatDuration, parseServices, KIND_COLORS, scoreZone, SCORE_ZONES, ZONE_TARGET,
} from "@/lib/utils";
import {
  ArrowLeft, Phone, Video, Star, MessageSquare,
  ThumbsUp, ThumbsDown,
  Lightbulb, BarChart3,
} from "lucide-react";
import { DateRangePicker, DateRange, currentMonthRange } from "@/components/ui/date-range-picker";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { InfoHint as Hint } from "@/components/ui/info-hint";
import { BrandCheck, BrandClose, BrandArrowRight } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  analyzed:      { label: "Проаналізовано", className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30" },
  pending:       { label: "Очікує",         className: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30" },
  failed:        { label: "Помилка",        className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30" },
  no_transcript: { label: "Немає запису",   className: "bg-muted text-muted-foreground border-border" },
};

function ScoreCell({ score }: { score: number }) {
  const barColor = scoreBarColor(score);
  const zone = scoreZone(score);
  return (
    <div className="flex flex-col items-end gap-1 min-w-[52px]" title={zone.description}>
      <div className="flex items-baseline gap-0.5">
        <span className={cn("text-base font-black", scoreColor(score))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/70 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: zone.hex }} />
        {zone.label}
      </span>
    </div>
  );
}

const MONTHS_UA = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

function buildMonthlyScores(analyzed: any[]) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const monthConvs = analyzed.filter((c: any) => {
      if (!c.date) return false;
      const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
      const cd = new Date(raw);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    });
    const monthScores = monthConvs
      .filter((c: any) => countsTowardAiScore(c))
      .map((c: any) => c.ai_analysis?.score)
      .filter((s: any): s is number => typeof s === "number" && s > 0);
    return {
      month: MONTHS_UA[d.getMonth()],
      score: monthScores.length
        ? Math.round(monthScores.reduce((a: number, b: number) => a + b, 0) / monthScores.length)
        : 0,
    };
  });
}

function ScoreChart({ scores }: { scores: { month: string; score: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 600, H = 120, PX = 28, PY = 16;
  const hasData = scores.some(s => s.score > 0);
  const min = 0, max = 100;
  const n = scores.length;
  const toX = (i: number) => n <= 1 ? W / 2 : PX + (i / (n - 1)) * (W - PX * 2);
  const toY = (v: number) => H - PY - ((v - min) / (max - min)) * (H - PY * 2);
  const gridVals = [0, 25, 50, 75, 100];

  const realPts = scores.map((s, i) => s.score > 0 ? { i, x: toX(i), y: toY(s.score) } : null).filter(Boolean) as { i: number; x: number; y: number }[];

  let linePath = "";
  let fillPath = "";
  if (realPts.length >= 2) {
    linePath = realPts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    fillPath = linePath
      + ` L${realPts[realPts.length - 1].x.toFixed(1)},${H - PY}`
      + ` L${realPts[0].x.toFixed(1)},${H - PY} Z`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" overflow="visible">
      <defs>
        <linearGradient id="mgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#003B29" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#003B29" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PX} y1={toY(v)} x2={W - PX} y2={toY(v)}
            stroke="#E5E7EB" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "4 4"} />
          <text x={PX - 6} y={toY(v) + 4} fontSize="11" fill="#6B7280" textAnchor="end"
            fontFamily="var(--font-geist-sans), sans-serif">{v}</text>
        </g>
      ))}
      {hasData && fillPath && <path d={fillPath} fill="url(#mgGrad)" />}
      {hasData && linePath && (
        <path d={linePath} fill="none" stroke="#003B29" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {scores.map((s, i) => {
        const x = toX(i);
        const hasScore = s.score > 0;
        const y = hasScore ? toY(s.score) : H / 2;
        const isH = hovered === i && hasScore;
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            {hasScore ? (
              <circle cx={x} cy={y} r={isH ? 6 : 4} fill="#003B29" stroke="white" strokeWidth="2" />
            ) : (
              <circle cx={x} cy={H / 2} r={4} fill="white" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="3 2" />
            )}
            <rect x={x - 28} y={0} width={56} height={H + 20} fill="transparent" style={{ cursor: hasScore ? "crosshair" : "default" }} />
            {isH && (
              <g>
                <rect x={x - 28} y={y - 36} width={56} height={28} rx="6" fill="#1C1C1C" />
                <text x={x} y={y - 22} fontSize="11" fill="#FF8B72" textAnchor="middle"
                  fontFamily="var(--font-unbounded), sans-serif" fontWeight="900">{s.score}</text>
                <text x={x} y={y - 11} fontSize="9" fill="#CBD5E1" textAnchor="middle"
                  fontFamily="var(--font-geist-sans), sans-serif">{s.month}</text>
              </g>
            )}
            {!hasScore && hovered === i && (
              <g>
                <rect x={x - 36} y={H / 2 - 22} width={72} height={20} rx="5" fill="#6B7280" />
                <text x={x} y={H / 2 - 9} fontSize="9" fill="white" textAnchor="middle"
                  fontFamily="var(--font-geist-sans), sans-serif">Немає даних</text>
              </g>
            )}
            <text x={x} y={H + 15} fontSize="11" fill={isH ? "#003B29" : hasScore ? "#6B7280" : "#D1D5DB"}
              textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight={isH ? "700" : "400"}>
              {s.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.back();
  } else {
    router.push("/team");
  }
}

export default function ManagerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange>(() => currentMonthRange());
  const [mgr, setMgr] = useState<any>(null);
  const [allConvs, setAllConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error();
        const { conversations, managers } = await res.json();
        // Support both slug (ivan-petrenko) and raw UUID for backwards compat
        const found = (managers ?? []).find((m: any) =>
          generateSlug(m.name) === id || m.id === id
        );
        setMgr(found ?? null);
        const mgrId = found?.id;
        setAllConvs((conversations ?? []).filter((c: any) => c.manager_id === mgrId));
      } catch {
        setMgr(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const filtered = (dateRange.from || dateRange.to)
    ? allConvs.filter(c => {
        if (!c.date) return false;
        const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(c.date) ? c.date : c.date + "Z";
        const d = new Date(raw);
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to) { const to = new Date(dateRange.to); to.setHours(23,59,59,999); if (d > to) return false; }
        return true;
      })
    : allConvs;

  const analyzed = filtered.filter(c => c.status === "analyzed");
  const scores = analyzed.filter(c => countsTowardAiScore(c)).map(c => c.ai_analysis?.score).filter((s): s is number => typeof s === "number" && s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const zoneCounts: Record<string, number> = Object.fromEntries(SCORE_ZONES.map(z => [z.value, 0]));
  for (const s of scores) zoneCounts[scoreZone(s).value]++;
  const calls = filtered.filter(c => c.type === "call").length;
  const meetings = filtered.filter(c => c.type === "meeting").length;
  const analyzedPct = filtered.length ? Math.round((analyzed.length / filtered.length) * 100) : 0;

  // Monthly chart — always the last 6 CALENDAR months, regardless of the page's date-range
  // filter. Building it from the filtered set instead used to silently blank out most of the
  // chart whenever a narrow period was selected (e.g. one month) — not because the manager
  // had no data those months, but because the input was already cut down to the filter.
  const allAnalyzed = allConvs.filter(c => c.status === "analyzed");
  const monthlyScores = buildMonthlyScores(allAnalyzed);

  // Aggregate from AI analyses — same всі типи зустрічей scope as the AI-бал itself,
  // so strengths/weaknesses/recommendations don't get diluted by service/feedback calls
  // scored against a script that isn't built for them.
  const allStrengths: string[] = [];
  const allWeaknesses: string[] = [];
  const allRecommendations: string[] = [];
  for (const c of analyzed.filter(c => countsTowardAiScore(c))) {
    if (Array.isArray(c.ai_analysis?.strengths)) allStrengths.push(...c.ai_analysis.strengths);
    if (Array.isArray(c.ai_analysis?.weaknesses)) allWeaknesses.push(...c.ai_analysis.weaknesses);
    if (Array.isArray(c.ai_analysis?.recommendations)) allRecommendations.push(...c.ai_analysis.recommendations);
    // also try string fields
    if (typeof c.ai_analysis?.strengths === "string") allStrengths.push(c.ai_analysis.strengths);
    if (typeof c.ai_analysis?.weaknesses === "string") allWeaknesses.push(c.ai_analysis.weaknesses);
    if (typeof c.ai_analysis?.recommendations === "string") allRecommendations.push(c.ai_analysis.recommendations);
  }
  const unique = (arr: string[]) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean))).slice(0, 5);
  const strengths = unique(allStrengths);
  const weaknesses = unique(allWeaknesses);
  const recommendations = unique(allRecommendations);

  if (loading) {
    return (
      <div>
        <Header title="Менеджер" subtitle="" />
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!mgr) {
    return (
      <div>
        <Header title="Команда" subtitle="" />
        <div className="p-6">
          <button onClick={() => goBack(router)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Назад до менеджерів
          </button>
          <p className="text-muted-foreground">Менеджера не знайдено.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={mgr.name} subtitle={mgr.position ?? "Менеджер"} />
      <div className="p-6 space-y-5">

        {/* Back + period selector */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => goBack(router)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-semibold"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Всі менеджери
          </button>
          <div className="flex items-center gap-3">
            <Link href={`/team?compare=${mgr.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <BarChart3 className="w-3.5 h-3.5" /> Порівняти з іншим менеджером
            </Link>
            <DateRangePicker value={dateRange} onChange={setDateRange} align="right" />
          </div>
        </div>

        {/* Profile + KPI */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <ManagerAvatar name={mgr.name} avatarUrl={mgr.avatar_url} className="w-14 h-14 rounded-2xl text-2xl shrink-0" />
              <div>
                <p className="font-black text-foreground text-sm leading-snug"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.name}</p>
                <p className="text-xs text-muted-foreground">{mgr.position ?? "Менеджер"}</p>
                <p className="text-xs text-muted-foreground">{mgr.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Розмов всього</span>
                <span className="font-bold text-foreground">{allConvs.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Дзвінки / Зустрічі</span>
                <span className="font-bold text-foreground">
                  {allConvs.filter(c => c.type === "call").length} / {allConvs.filter(c => c.type === "meeting").length}
                </span>
              </div>
            </div>
          </div>

          {([
            {
              label: "AI Бал",
              hint: "Середній бал за обраний період — всі типи зустрічей (єдині типи з активними критеріями оцінки).",
              value: avgScore || "—", icon: Star, color: "bg-accent/15 text-accent-strong", type: "score" as const,
            },
            {
              label: "Проаналізовано",
              hint: "Відсоток розмов що пройшли AI-аналіз за обраний період.",
              value: analyzed.length > 0 ? `${analyzedPct}%` : "—", icon: MessageSquare, color: "bg-primary/8 text-primary", type: "percent" as const,
            },
            {
              label: "Розмов за період",
              hint: "Кількість дзвінків і зустрічей за обраний період.",
              value: filtered.length, icon: MessageSquare, color: "bg-primary/8 text-primary", type: "count" as const,
            },
          ] as const).map(({ label, hint, value, icon: Icon, color, type }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {label}
                  <Hint text={hint} className="ml-1" />
                </p>
                <div className={cn("p-2 rounded-lg shrink-0", color)}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className={cn("text-3xl font-black", type === "score" ? scoreColor(typeof value === "number" ? value : 0) : "text-foreground")}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {value}
              </p>
              {type === "score" && typeof value === "number" && (
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", scoreBarColor(value))}
                    style={{ width: `${Math.min(value, 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Score chart + Strengths/Weaknesses */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-foreground" />
                <h3 className="text-sm font-black text-foreground flex items-center"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Динаміка AI-балу
                  <Hint text="Середній AI-бал за місяць за останні 6 календарних місяців — всі типи зустрічей. Не залежить від фільтра періоду вище. Порожні кола = немає аналізованих розмов того місяця." className="ml-1" />
                </h3>
              </div>
              {allAnalyzed.length > 0 && (
                <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                  Останні 6 місяців
                </span>
              )}
            </div>
            {allAnalyzed.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                Немає аналізованих розмов
              </div>
            ) : (
              <ScoreChart scores={monthlyScores} />
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-black text-foreground"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Статистика
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs py-2 border-b border-border">
                <span className="text-muted-foreground">Дзвінки (період)</span>
                <span className="font-bold flex items-center gap-1"><Phone className="w-3 h-3 text-primary" />{calls}</span>
              </div>
              <div className="flex justify-between text-xs py-2 border-b border-border">
                <span className="text-muted-foreground">Зустрічі (період)</span>
                <span className="font-bold flex items-center gap-1"><Video className="w-3 h-3 text-accent-strong" />{meetings}</span>
              </div>
              <div className="flex justify-between text-xs py-2 border-b border-border">
                <span className="text-muted-foreground">Проаналізовано</span>
                <span className="font-bold text-primary">{analyzed.length}</span>
              </div>
              <div className="flex justify-between text-xs py-2">
                <span className="text-muted-foreground">Середній AI-бал</span>
                <span className={cn("font-black text-sm", scoreColor(avgScore))}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{avgScore || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Zone distribution — same three coaching zones as the Dashboard widget,
            scoped to this manager's own scored conversations for the selected period. */}
        {scores.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Розподіл по зонах
              </h3>
              <Hint text="Скільки розмов потрапило в кожну з трьох зон якості за обраний період. Пунктир — ціль компанії на Q3." className="ml-1" />
            </div>
            <div className="space-y-3">
              {SCORE_ZONES.map(zone => {
                const count = zoneCounts[zone.value];
                const pct = scores.length ? Math.round((count / scores.length) * 100) : 0;
                const target = ZONE_TARGET[zone.value];
                return (
                  <div key={zone.value} className="flex items-center gap-3">
                    <span className="text-xs w-24 shrink-0 flex items-center gap-1.5 text-muted-foreground"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.hex }} />
                      {zone.label}
                    </span>
                    <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden relative">
                      <div className={cn("h-full rounded-full transition-all duration-300", zone.bar)} style={{ width: `${pct}%` }} />
                      {target && (
                        <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/30" style={{ left: `${target.value}%` }}
                          title={`Ціль Q3: ${target.type === "min" ? "не менше" : "не більше"} ${target.value}%`} />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 w-16 justify-end shrink-0">
                      <span className="text-xs font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{count}</span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strengths + Weaknesses + Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-black text-emerald-700 dark:text-emerald-400 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Сильні сторони
                <Hint text="Навички, виявлені AI за обраний період — лише з розмов типу «Брифування» та «Презентація КП» (єдині типи з активними критеріями оцінки)." className="ml-1" />
              </h3>
            </div>
            {strengths.length === 0 ? (
              <p className="text-xs text-muted-foreground">Недостатньо даних</p>
            ) : (
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <BrandCheck className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ThumbsDown className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-black text-red-600 dark:text-red-400 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Зони росту
                <Hint text="Повторювані слабкі місця, виявлені AI — лише з розмов типу «Брифування» та «Презентація КП» (єдині типи з активними критеріями оцінки)." className="ml-1" />
              </h3>
            </div>
            {weaknesses.length === 0 ? (
              <p className="text-xs text-muted-foreground">Недостатньо даних</p>
            ) : (
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <BrandClose className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-accent-strong" />
              <h3 className="text-sm font-black text-foreground flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Рекомендації
                <Hint text="Конкретні дії для покращення, сформовані AI — лише з розмов типу «Брифування» та «Презентація КП» (єдині типи з активними критеріями оцінки)." className="ml-1" />
              </h3>
            </div>
            {recommendations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Недостатньо даних</p>
            ) : (
              <div className="space-y-2">
                {recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-secondary/40 transition-colors">
                    <RankBadge rank={i + 1} className="w-5 h-5 mt-0.5" />
                    <p className="text-xs text-foreground leading-snug" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{r}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent conversations */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Розмови за період
            </h3>
            <Link href={`/conversations?manager=${mgr?.id ?? ""}`}
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1">
              Всі розмови <BrandArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Розмов не знайдено</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Клієнт</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Послуга</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип розмови</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тривалість</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Дата</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Статус</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>AI Бал</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, 10).map(conv => {
                    const score = conv.ai_analysis?.score;
                    const duration = conv.duration_seconds ?? 0;
                    const statusMeta = STATUS_LABEL[conv.status] ?? STATUS_LABEL["pending"];
                    return (
                      <tr key={conv.id} className="hover:bg-secondary transition-colors group">
                        <td className="px-4 py-3.5">
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">
                            {conv.type === "call" ? <Phone className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-foreground text-sm" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                            {stripAgencyPrefix(conv.client_name) || "Невідомий"}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          {conv.service && (
                            <div className="flex flex-wrap gap-1">
                              {parseServices(conv.service).map((svc: string) => (
                                <span key={svc} className="text-xs font-bold px-2 py-0.5 rounded-md border border-border bg-secondary text-muted-foreground whitespace-nowrap"
                                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                                  {svc}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {conv.conversation_kind && (() => {
                            const kindColor = KIND_COLORS[conv.conversation_kind] ?? "#6b7280";
                            return (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md border whitespace-nowrap"
                                style={{ color: kindColor, backgroundColor: `${kindColor}14`, borderColor: `${kindColor}33`, fontFamily: "var(--font-unbounded), sans-serif" }}>
                                {conv.conversation_kind}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">
                          {formatDuration(duration)}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground text-xs">
                          {formatDate(conv.date)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", statusMeta.className)}
                            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {score != null ? (
                            <ScoreCell score={score} />
                          ) : conv.status === "analyzed" ? (
                            <span className="inline-block whitespace-nowrap text-xs bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-md font-semibold"
                              title="Цей тип розмови не оцінюється за критеріями всі типи зустрічей"
                              style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>
                              Без оцінки
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md font-semibold"
                              style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>
                              В черзі
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={`/conversations/${conv.id}`} className="text-muted-foreground group-hover:text-primary transition-colors">
                            <BrandArrowRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
