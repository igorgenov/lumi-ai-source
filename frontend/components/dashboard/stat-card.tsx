"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/info-hint";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  accent?: "green" | "lime" | "yellow" | "red";
  target?: { pct: number; label: string };
  hint?: string;
  href?: string;
}

const ACCENT = {
  green:  { icon: "bg-primary/8 text-primary",  value: "text-primary",  ring: "border-primary/10", progress: "bg-primary" },
  lime:   { icon: "bg-accent/15 text-accent-strong", value: "text-foreground",  ring: "border-accent/30", progress: "bg-accent" },
  yellow: { icon: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",    value: "text-yellow-700 dark:text-yellow-400", ring: "border-yellow-200 dark:border-yellow-500/30",   progress: "bg-yellow-400" },
  red:    { icon: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",          value: "text-red-600 dark:text-red-400",    ring: "border-red-100",      progress: "bg-red-400" },
};

export function StatCard({ title, value, change, changeLabel, icon: Icon, accent = "green", target, hint, href }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const s = ACCENT[accent];

  const inner = (
    <>
      {hint && <InfoHint text={hint} className="absolute top-3 right-3 z-10" />}

      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider pr-5"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {title}
        </p>
        <div className={cn("p-2 rounded-lg shrink-0 transition-colors", s.icon)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div>
        <p className={cn("text-3xl font-black", s.value)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {value}
        </p>
        {change !== undefined && (
          <p className={cn("text-xs mt-1 font-medium", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
            {isPositive ? "↑" : "↓"} {Math.abs(change)}%
            {changeLabel && <span className="text-muted-foreground font-normal"> {changeLabel}</span>}
          </p>
        )}
      </div>

      {target && (
        <div className="space-y-1.5 mt-auto">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">{target.label}</span>
            <span className="font-bold text-muted-foreground">{Math.round(target.pct)}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-500", s.progress)}
              style={{ width: `${Math.min(target.pct, 100)}%` }} />
          </div>
        </div>
      )}

      {href && (
        <div className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/50 group-hover:text-primary transition-colors"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Детальніше <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </>
  );

  const baseClass = cn(
    "relative bg-card border rounded-xl p-5 flex flex-col gap-3 transition-all duration-150",
    s.ring,
    href && "cursor-pointer hover:shadow-md hover:border-primary/20 active:scale-[0.99] group"
  );

  if (href) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <Link href={href as any} className={baseClass}>{inner}</Link>;
  }
  return <div className={baseClass}>{inner}</div>;
}
