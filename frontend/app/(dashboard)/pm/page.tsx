"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { cn, scoreHexColor } from "@/lib/utils";
import { FolderKanban, Clock, DollarSign, Users, TrendingUp, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import { DateRangePicker, DateRange, currentWeekRange } from "@/components/ui/date-range-picker";
import Link from "next/link";
import { InfoHint } from "@/components/ui/info-hint";

type KpiStatus = "good" | "warning" | "danger" | "neutral";

function PmKpiCard({
  title,
  value,
  subtitle,
  status,
  icon: Icon,
  hint,
  href,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  status: KpiStatus;
  icon: React.ElementType;
  hint: string;
  href?: string;
}) {
  const statusColors: Record<KpiStatus, { bg: string; text: string; border: string }> = {
    good: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" },
    warning: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
    danger: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
    neutral: { bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700" },
  };

  const colors = statusColors[status];
  const Wrapper = href ? Link : "div";

  return (
    <Wrapper
      href={href || "#"}
      className={cn(
        "relative bg-card border rounded-xl p-5 flex flex-col gap-3 transition-all duration-150",
        href && "cursor-pointer hover:shadow-md hover:border-primary/20 active:scale-[0.99]",
        colors.border
      )}
    >
      <InfoHint text={hint} className="absolute top-3 right-3 z-10" />
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider pr-5"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {title}
        </p>
        <div className={cn("p-2 rounded-lg", colors.bg, colors.text)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-3xl font-bold", colors.text)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {value}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {href && (
        <div className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/50 hover:text-primary transition-colors"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Детальніше <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </Wrapper>
  );
}

function ProjectHealthBar({ health, label }: { health: number; label: string }) {
  const color = scoreHexColor(health);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${health}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-8 text-right" style={{ color }}>{health}</span>
    </div>
  );
}

export default function PmDashboardPage() {
  const [range, setRange] = useState<DateRange>(currentWeekRange());

  const stats = {
    totalProjects: 12,
    activeProjects: 8,
    avgHealthScore: 72,
    deadlinesOnTrack: 7,
    deadlinesAtRisk: 2,
    deadlinesDelayed: 1,
    budgetOnTrack: 9,
    budgetOver: 1,
    teamEngagement: 85,
    meetingsThisWeek: 14,
    actionItemsPending: 23,
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="PM Dashboard" subtitle="Моніторинг стану проектів та команди" />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Загальний огляд
            </h2>
            <DateRangePicker value={range} onChange={setRange} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PmKpiCard
              title="Здоров'я проектів"
              value={stats.avgHealthScore}
              subtitle="середній бал"
              status={stats.avgHealthScore >= 70 ? "good" : stats.avgHealthScore >= 50 ? "warning" : "danger"}
              icon={TrendingUp}
              hint="Середній бал здоров'я всіх активних проектів за критеріями AI-аналізу"
              href="/conversations"
            />
            <PmKpiCard
              title="Дедлайни"
              value={`${stats.deadlinesOnTrack}/${stats.totalProjects}`}
              subtitle="в нормі"
              status={stats.deadlinesDelayed === 0 ? "good" : stats.deadlinesDelayed <= 2 ? "warning" : "danger"}
              icon={Clock}
              hint="Співвідношення проектів з дотриманням та порушенням строків"
            />
            <PmKpiCard
              title="Бюджет"
              value={`${stats.budgetOnTrack}/${stats.totalProjects}`}
              subtitle="в нормі"
              status={stats.budgetOver === 0 ? "good" : "warning"}
              icon={DollarSign}
              hint="Співвідношення проектів з дотриманням та перевищенням бюджету"
            />
            <PmKpiCard
              title="Залученість команди"
              value={`${stats.teamEngagement}%`}
              status={stats.teamEngagement >= 80 ? "good" : stats.teamEngagement >= 60 ? "warning" : "danger"}
              icon={Users}
              hint="Відсоток активних учасників команди за обраний період"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <PmKpiCard
              title="Зустрічі цього тижня"
              value={stats.meetingsThisWeek}
              status="neutral"
              icon={FolderKanban}
              hint="Кількість зустрічей по проектах за поточний тиждень"
            />
            <PmKpiCard
              title="Відкриті завдання"
              value={stats.actionItemsPending}
              status={stats.actionItemsPending <= 10 ? "good" : stats.actionItemsPending <= 20 ? "warning" : "danger"}
              icon={AlertTriangle}
              hint="Кількість невиконаних action items з попередніх зустрічей"
            />
            <PmKpiCard
              title="Активні проекти"
              value={stats.activeProjects}
              subtitle={`з ${stats.totalProjects} загалом`}
              status="neutral"
              icon={CheckCircle}
              hint="Проекти в статусі active"
            />
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Проекти за станом здоров'я
              </h3>
              <InfoHint text="Середній бал здоров'я кожного проекту за останніми зустрічами" />
            </div>
            <div className="space-y-3">
              <ProjectHealthBar health={85} label="Inweb Main" />
              <ProjectHealthBar health={72} label="E-commerce Rebuild" />
              <ProjectHealthBar health={65} label="Mobile App" />
              <ProjectHealthBar health={48} label="API Migration" />
              <ProjectHealthBar health={91} label="Design System" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Статус дедлайнів
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{stats.deadlinesOnTrack}</div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-500">В нормі</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{stats.deadlinesAtRisk}</div>
                  <div className="text-xs text-amber-600 dark:text-amber-500">Під загрозою</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <Clock className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">{stats.deadlinesDelayed}</div>
                  <div className="text-xs text-red-600 dark:text-red-500">Затримка</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
