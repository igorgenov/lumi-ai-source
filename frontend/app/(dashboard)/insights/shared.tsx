"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table as TableIcon, HelpCircle, Database } from "lucide-react";
import { cn, scoreBarColor, scoreHexColor, SCORE_ZONES } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Objection  { label: string; count: number; pct: number; avgHandling: number; color: string }
export interface ManagerRow { name: string; insight: string }
export interface QuoteRow   { manager: string; client: string; text: string; conversationId?: string }
export interface StatKpi    { label: string; value: string; sub?: string; color?: string }
export interface TableData  { title?: string | null; headers: string[]; rows: string[][] }
export interface ManagerStat { name: string; avgScore: number; count: number }
export interface ComputedStats { overallAvgScore: number | null; overallCount: number; byManager: ManagerStat[] }

export interface BlockBase { type: string }
export interface StatBlock extends BlockBase { type: "stat"; label: string; value: string; sub?: string }
export interface GaugeBlock extends BlockBase { type: "gauge"; label: string; value: number; max: number; sub?: string }
export interface BarChartBlock extends BlockBase { type: "bar_chart"; title?: string; mode: "count" | "score"; items: { label: string; value: number }[] }
export interface PieChartBlock extends BlockBase { type: "pie_chart"; title?: string; items: { label: string; value: number }[] }
export interface RankedListBlock extends BlockBase { type: "ranked_list"; title?: string; items: { label: string; score: number; trend?: "up" | "down" | "flat"; conversationId?: string }[] }
export interface TableBlockRow { cells: string[]; rowType?: "positive" | "negative" | "risk" | "neutral"; conversationId?: string }
export interface TableBlock extends BlockBase { type: "table"; title?: string; headers: string[]; rows: TableBlockRow[] }
export interface TwoColumnBlock extends BlockBase { type: "two_column_list"; leftTitle: string; rightTitle: string; left: string[]; right: string[] }
export interface ThemeSectionItem { label: string; text: string; kind?: "example_positive" | "example_negative" | "risk" | "observation" | "quote"; conversationId?: string }
export interface ThemeSectionBlock extends BlockBase { type: "theme_section"; title: string; items: ThemeSectionItem[] }
export interface ZoneTrendPoint { label: string; red: number; yellow: number; green: number; total: number }
export interface ZoneTrendBlock extends BlockBase { type: "zone_trend"; title?: string; points: ZoneTrendPoint[] }
export type Block = StatBlock | GaugeBlock | BarChartBlock | PieChartBlock | RankedListBlock | TableBlock | TwoColumnBlock | ThemeSectionBlock | ZoneTrendBlock;

export const CHART_COLORS = ["#003B29", "#EF583D", "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#EC4899", "#14B8A6"];

export const ROW_TYPE_STYLE: Record<string, string> = {
  positive: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  negative: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
  risk: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  neutral: "bg-secondary/60 text-muted-foreground border-border",
};
export const ROW_TYPE_LABEL: Record<string, string> = { positive: "Гарний приклад", negative: "Проблема", risk: "Ризик", neutral: "Нейтрально" };

export const KIND_META: Record<string, { label: string; className: string; cardClass: string }> = {
  example_positive: { label: "Позитивний приклад", className: "text-emerald-700 dark:text-emerald-400", cardClass: "bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30" },
  example_negative: { label: "Негативний приклад", className: "text-red-600 dark:text-red-400", cardClass: "bg-red-50/60 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" },
  risk: { label: "Ризик", className: "text-amber-700 dark:text-amber-400", cardClass: "bg-amber-50/60 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" },
  observation: { label: "Спостереження", className: "text-foreground", cardClass: "bg-secondary/20 border-border" },
  quote: { label: "Цитата", className: "text-accent-strong", cardClass: "bg-accent/6 border-accent/20" },
};

export function sentimentTone(title: string): "positive" | "negative" | "neutral" {
  const t = title.toLowerCase();
  const neg = ["проблем", "ризик", "слабк", "недолік", "помилк", "втрат", "загроз", "відтік", "відмов", "прогалин", "негатив"];
  const pos = ["сильн", "перевал", "переваг", "можлив", "успіх", "добре", "плюс", "зростан", "покращ", "позитив"];
  if (neg.some(w => t.includes(w))) return "negative";
  if (pos.some(w => t.includes(w))) return "positive";
  return "neutral";
}

export const TONE_CARD_CLASS: Record<string, string> = {
  positive: "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30",
  negative: "bg-red-50/50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
  neutral: "bg-card border-border",
};

export function findingTone(text: string): "negative" | "warning" | "positive" | "neutral" {
  const t = text.toLowerCase();
  const warning = ["нестабільн", "непослідовн", "коливаєт", "варіює", "потребує уваги"];
  const negative = ["падінн", "знизивс", "знижен", "гірше", "відсутність", "відсутній", "слабк", "втрат", "провал", "не з'ясов", "не фіксу", "не озвуч"];
  const positive = ["сильна сторона", "стабільна сильна", "перевага", "покращ", "зростан", "успішн"];
  if (warning.some(w => t.includes(w))) return "warning";
  if (negative.some(w => t.includes(w))) return "negative";
  if (positive.some(w => t.includes(w))) return "positive";
  return "neutral";
}

export const FINDING_TONE_CARD_CLASS: Record<string, string> = {
  negative: "bg-red-50/60 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
  warning: "bg-amber-50/60 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",
  positive: "bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30",
  neutral: "bg-secondary/10 border-border",
};

export const TONE_HEADING_CLASS: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral: "text-foreground",
};

export const TREND_ARROW: Record<string, string> = { up: "↗", down: "↘", flat: "→" };
export const TREND_COLOR: Record<string, string> = { up: "text-emerald-600 dark:text-emerald-400", down: "text-red-500 dark:text-red-400", flat: "text-muted-foreground" };

export function splitTaggedItems(s: string): string[] {
  if (s.includes("<item>")) {
    const matches = Array.from(s.matchAll(/<item>([\s\S]*?)<\/item>/g)).map(m => m[1].trim()).filter(Boolean);
    if (matches.length > 0) return matches;
  }
  return [s];
}

export function splitListItems(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(x => splitTaggedItems(String(x)));
  if (typeof v === "string") return splitTaggedItems(v);
  return v ? [String(v)] : [];
}

export const FINDING_NUMBER_SOURCE = "\\(\\d{1,3}\\/100\\)|\\d{1,3}\\/100|\\d{1,3}%";
export const FINDING_NUMBER_MATCH = new RegExp(`^(${FINDING_NUMBER_SOURCE})$`);

export function extractNameTokens(names: string[]): string[] {
  const clean = names.map(n => n.trim()).filter(n => n && !/^Вс[іi]\s/.test(n) && !/^Ус[іi]\s/.test(n));
  const parts = clean.flatMap(n => n.split(/\s+/)).filter(w => w.length >= 3);
  return Array.from(new Set([...clean, ...parts])).sort((a, b) => b.length - a.length);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function FindingText({ text, nameTokens }: { text: string; nameTokens?: string[] }) {
  const pattern = useMemo(() => {
    const namePart = nameTokens && nameTokens.length ? "|" + nameTokens.map(escapeRegExp).join("|") : "";
    return new RegExp(`(${FINDING_NUMBER_SOURCE}${namePart})`, "g");
  }, [nameTokens]);
  const nameSet = useMemo(() => new Set(nameTokens ?? []), [nameTokens]);
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        FINDING_NUMBER_MATCH.test(part) || nameSet.has(part)
          ? <strong key={i} className="font-bold text-foreground">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

export function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d{1,2}[.)]\s*/, "");
}

export function toChartObjections(raw: { label: string; count: number }[] | undefined): Objection[] | undefined {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
  const clean = raw
    .map(r => ({ label: String(r?.label ?? "—"), count: Number(r?.count) || 0 }))
    .filter(r => r.count > 0);
  if (clean.length === 0) return undefined;
  const total = clean.reduce((s, r) => s + r.count, 0) || 1;
  return clean.map((r, i) => ({
    label: r.label,
    count: r.count,
    pct: Math.round((r.count / total) * 100),
    avgHandling: 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export function HBarChart({ data }: { data: Objection[] }) {
  if (!data || data.length === 0) return null;
  const maxPct = Math.max(1, ...data.map(d => d.pct || 0));
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <span className="text-xs text-muted-foreground leading-snug" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{d.label}</span>
            <span className="text-xs font-bold text-primary shrink-0 whitespace-nowrap" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {d.pct}% ({d.count})
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${((d.pct || 0) / maxPct) * 100}%`, backgroundColor: d.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableCard({ table }: { table: TableData }) {
  if (!table.headers?.length || !table.rows?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TableIcon className="w-4 h-4 text-foreground" />
        <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {table.title || "Таблиця"}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary">
              {table.headers.map((h, i) => (
                <th key={i} className="text-left py-2 px-3 font-bold text-muted-foreground uppercase text-[11px] tracking-wide whitespace-nowrap"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-0 hover:bg-secondary/20">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-2 px-3 text-foreground/80 align-top">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BlockRenderer({ blocks }: { blocks?: Block[] | null }) {
  const router = useRouter();
  if (!blocks || blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "stat": {
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.label}</p>
                <p className="text-2xl font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.value}</p>
                {block.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{block.sub}</p>}
              </div>
            );
          }
          case "gauge": {
            const pct = block.max > 0 ? Math.min(100, Math.max(0, (block.value / block.max) * 100)) : 0;
            const isScore = block.max === 100;
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.label}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.value}</span>
                  <span className="text-xs text-muted-foreground">/ {block.max}</span>
                </div>
                <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-300", isScore ? scoreBarColor(block.value) : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
                {block.sub && <p className="text-[11px] text-muted-foreground mt-2">{block.sub}</p>}
              </div>
            );
          }
          case "bar_chart": {
            if (!block.items?.length) return null;
            const maxVal = Math.max(1, ...block.items.map(it => Math.abs(it.value)));
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                {block.title && <h4 className="text-sm font-black text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title}</h4>}
                <div className="space-y-3">
                  {block.items.map((it, j) => (
                    <div key={j}>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{it.label}</span>
                        <span className="text-xs font-bold text-foreground shrink-0" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{it.value}</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-300", block.mode === "score" ? scoreBarColor(it.value) : "bg-primary")}
                          style={{ width: `${(Math.abs(it.value) / maxVal) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          case "pie_chart": {
            if (!block.items?.length) return null;
            const total = block.items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1;
            let acc = 0;
            const stops = block.items.map((it, j) => {
              const from = (acc / total) * 360;
              acc += Math.max(0, it.value);
              const to = (acc / total) * 360;
              return `${CHART_COLORS[j % CHART_COLORS.length]} ${from}deg ${to}deg`;
            }).join(", ");
            const dominant = block.items.reduce((a, b) => (b.value > a.value ? b : a), block.items[0]);
            const dominantPct = Math.round((dominant.value / total) * 100);
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                {block.title && <h4 className="text-sm font-black text-foreground mb-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title}</h4>}
                <p className="text-xs text-muted-foreground mb-4">
                  <span className="font-bold text-foreground">{dominant.value} з {total} ({dominantPct}%)</span> — {dominant.label.toLowerCase()}
                </p>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="relative w-32 h-32 shrink-0">
                    <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
                    <div className="absolute inset-[14px] rounded-full bg-card" />
                  </div>
                  <div className="space-y-1.5">
                    {block.items.map((it, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[j % CHART_COLORS.length] }} />
                        <span className="text-foreground/80">{it.label}</span>
                        <span className="font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          case "ranked_list": {
            if (!block.items?.length) return null;
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                {block.title && <h4 className="text-sm font-black text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title}</h4>}
                <div className="space-y-3">
                  {block.items.map((it, j) => (
                    <div key={j} className={cn("flex items-center gap-3", it.conversationId && "cursor-pointer group")}
                      onClick={() => it.conversationId && router.push(`/conversations/${it.conversationId}`)}>
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{j + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={cn("text-xs text-foreground/90 truncate", it.conversationId && "group-hover:text-primary group-hover:underline")}>{it.label}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{it.score}</span>
                            {it.trend && <span className={cn("text-xs", TREND_COLOR[it.trend])}>{TREND_ARROW[it.trend]}</span>}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", scoreBarColor(it.score))} style={{ width: `${Math.min(100, Math.max(0, it.score))}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          case "table": {
            if (!block.headers?.length || !block.rows?.length) return null;
            const distinctRowTypes = new Set(block.rows.map(r => r.rowType).filter(Boolean));
            const showRowTypeCol = distinctRowTypes.size > 1;
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TableIcon className="w-4 h-4 text-foreground" />
                  <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title || "Таблиця"}</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-secondary">
                        {showRowTypeCol && <th className="text-left py-2 px-3 font-bold text-muted-foreground uppercase text-[11px] tracking-wide whitespace-nowrap" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Оцінка</th>}
                        {block.headers.map((h, hi) => (
                          <th key={hi} className="text-left py-2 px-3 font-bold text-muted-foreground uppercase text-[11px] tracking-wide whitespace-nowrap" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, ri) => (
                        <tr key={ri}
                          className={cn("border-b border-border last:border-0 hover:bg-secondary/20", row.conversationId && "cursor-pointer")}
                          onClick={() => row.conversationId && router.push(`/conversations/${row.conversationId}`)}>
                          {showRowTypeCol && row.rowType && (
                            <td className="py-2 px-3 align-top">
                              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", ROW_TYPE_STYLE[row.rowType])}>{ROW_TYPE_LABEL[row.rowType]}</span>
                            </td>
                          )}
                          {row.cells.map((cell, ci) => (
                            <td key={ci} className="py-2 px-3 text-foreground/80 align-top">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          case "two_column_list": {
            const leftTone = sentimentTone(block.leftTitle);
            const rightTone = sentimentTone(block.rightTitle);
            return (
              <div key={i} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={cn("border rounded-xl p-5", TONE_CARD_CLASS[leftTone])}>
                  <h4 className={cn("text-sm font-black mb-3", TONE_HEADING_CLASS[leftTone])} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.leftTitle}</h4>
                  <ul className="space-y-2">
                    {block.left.map((item, j) => (
                      <li key={j} className="text-xs text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className={cn("border rounded-xl p-5", TONE_CARD_CLASS[rightTone])}>
                  <h4 className={cn("text-sm font-black mb-3", TONE_HEADING_CLASS[rightTone])} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.rightTitle}</h4>
                  <ul className="space-y-2">
                    {block.right.map((item, j) => (
                      <li key={j} className="text-xs text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }
          case "theme_section":
            if (!block.items?.length) return null;
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                <h4 className="text-sm font-black text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title}</h4>
                <div className="space-y-3">
                  {block.items.map((it, j) => {
                    const meta = it.kind ? KIND_META[it.kind] : null;
                    return (
                      <div key={j} className={cn("rounded-lg p-3 border", meta ? meta.cardClass : "bg-secondary/20 border-border", it.conversationId && "hover:border-primary/40 transition-colors cursor-pointer")}
                        onClick={() => it.conversationId && router.push(`/conversations/${it.conversationId}`)}>
                        {meta && <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", meta.className)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{meta.label}</p>}
                        <p className="text-xs font-bold text-foreground mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{it.label}</p>
                        <p className="text-xs text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{it.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          case "zone_trend": {
            if (!block.points?.length) return null;
            const zoneHex = Object.fromEntries(SCORE_ZONES.map(z => [z.value, z.hex])) as Record<"red" | "yellow" | "green", string>;
            return (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                {block.title && <h4 className="text-sm font-black text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{block.title}</h4>}
                <div className="space-y-2.5">
                  {block.points.map((p, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">{p.label}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden bg-secondary/40 flex">
                        {p.total === 0
                          ? <div className="h-full w-full bg-secondary/60" />
                          : (["red", "yellow", "green"] as const).map(zone => p[zone] > 0 && (
                              <div key={zone} style={{ width: `${(p[zone] / p.total) * 100}%`, backgroundColor: zoneHex[zone] }}
                                title={`${SCORE_ZONES.find(z => z.value === zone)?.label}: ${p[zone]}`} />
                            ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{p.total || "—"}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-3 justify-center">
                  {SCORE_ZONES.map(zone => (
                    <span key={zone.value} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: zone.hex }} />
                      {zone.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

const QUESTION_PREVIEW_LENGTH = 260;
export function QueryBlock({ question, compact }: { question: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = question.length > QUESTION_PREVIEW_LENGTH;
  const shown = !isLong || expanded ? question : question.slice(0, QUESTION_PREVIEW_LENGTH).trimEnd() + "…";
  return (
    <div className={cn("bg-muted border border-border border-l-4 border-l-muted-foreground/40 rounded-xl",
      compact ? "px-3 py-2.5" : "px-4 py-3")}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5"
        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
        <HelpCircle className="w-3.5 h-3.5" /> Запит до AI
      </p>
      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
        {shown}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)}
          className="mt-1.5 text-[11px] font-bold text-primary hover:underline">
          {expanded ? "Згорнути" : "Показати повністю"}
        </button>
      )}
    </div>
  );
}

export function FilterChip({ label, value, color }: { label: string; value: string; color: "slate" | "blue" | "amber" }) {
  const styles = {
    slate: "bg-muted border-border text-muted-foreground",
    blue: "bg-accent/8 border-accent/20 text-accent-strong",
    amber: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400",
  }[color];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] leading-none", styles)}>
      <span className="font-bold uppercase tracking-wide text-[10px] opacity-70" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{label}</span>
      <span className="font-medium" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{value}</span>
    </span>
  );
}

export function DeltaBadge({ delta }: { delta: number }) {
  if (!delta) return <span className="text-[10px] text-muted-foreground ml-1.5">± 0</span>;
  const up = delta > 0;
  return (
    <span className={cn("text-[10px] font-bold ml-1.5", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function ComputedStatsCard({ stats, previous, previousLabel, hideOverall }: { stats: ComputedStats; previous?: ComputedStats | null; previousLabel?: string | null; hideOverall?: boolean }) {
  if (stats.overallCount === 0 && stats.byManager.length === 0) return null;
  if (hideOverall && stats.byManager.length <= 1) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Database className="w-4 h-4 text-foreground" />
        <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Реальні дані з бази
        </h4>
        {previous && (
          <span className="text-[10px] text-muted-foreground">vs {previousLabel}</span>
        )}
      </div>
      {!hideOverall && (
      <div className="flex items-center gap-6 flex-wrap mb-3">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Середній бал</p>
          <p className="text-xl font-black text-foreground flex items-center" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {stats.overallAvgScore ?? "—"}
            {previous?.overallAvgScore != null && stats.overallAvgScore != null && (
              <DeltaBadge delta={stats.overallAvgScore - previous.overallAvgScore} />
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Оцінених розмов</p>
          <p className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{stats.overallCount}</p>
        </div>
      </div>
      )}
      {stats.byManager.length > 1 && (
        <div className="space-y-1 border-t border-border pt-3">
          {stats.byManager.map(m => {
            const prevM = previous?.byManager.find(p => p.name === m.name);
            return (
              <div key={m.name} className="flex items-center justify-between text-xs py-1">
                <span className="font-semibold text-foreground">{m.name}</span>
                <span className="flex items-center">
                  <span className="font-bold text-foreground">{m.avgScore}</span>
                  <span className="text-muted-foreground ml-1">({m.count})</span>
                  {prevM && <DeltaBadge delta={m.avgScore - prevM.avgScore} />}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PDF export ────────────────────────────────────────────────────────────────
const ROW_TYPE_LABEL_HTML: Record<string, string> = { positive: "Гарний приклад", negative: "Проблема", risk: "Ризик", neutral: "Нейтрально" };
const ROW_TYPE_HEX: Record<string, string> = { positive: "#10b981", negative: "#ef4444", risk: "#f59e0b", neutral: "#9ca3af" };
const KIND_LABEL_HTML: Record<string, string> = { example_positive: "Позитивний приклад", example_negative: "Негативний приклад", risk: "Ризик", observation: "Спостереження", quote: "Цитата" };
const TONE_HEX: Record<string, { bg: string; border: string; heading: string }> = {
  positive: { bg: "#ecfdf5", border: "#a7f3d0", heading: "#059669" },
  negative: { bg: "#fef2f2", border: "#fecaca", heading: "#dc2626" },
  neutral: { bg: "#ffffff", border: "#e5e7eb", heading: "#003B29" },
};
const KIND_TONE_HTML: Record<string, { bg: string; border: string }> = {
  example_positive: { bg: "#ecfdf5", border: "#a7f3d0" },
  example_negative: { bg: "#fef2f2", border: "#fecaca" },
  risk: { bg: "#fffbeb", border: "#fde68a" },
  observation: { bg: "#f9fafb", border: "#e5e7eb" },
  quote: { bg: "rgba(239,88,61,0.06)", border: "rgba(239,88,61,0.25)" },
};
const TREND_ARROW_HTML: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

export function renderBlocksHtml(blocks: Block[]): string {
  if (!blocks || blocks.length === 0) return "";
  return blocks.map(block => {
    switch (block.type) {
      case "stat": {
        return `<div class="section"><div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px">
          <div style="font-size:10px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${block.label}</div>
          <div style="font-size:22px;font-weight:900;color:#1C1C1C">${block.value}</div>
          ${block.sub ? `<div style="font-size:11px;color:#666;margin-top:2px">${block.sub}</div>` : ""}
        </div></div>`;
      }
      case "gauge": {
        const pct = block.max > 0 ? Math.min(100, Math.max(0, (block.value / block.max) * 100)) : 0;
        const isScore = block.max === 100;
        const gaugeColor = isScore ? scoreHexColor(block.value) : "#003B29";
        return `<div class="section"><div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px">
          <div style="font-size:10px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">${block.label}</div>
          <div style="font-size:16px;font-weight:900;color:#1C1C1C;margin-bottom:6px">${block.value} <span style="font-size:11px;color:#666;font-weight:normal">/ ${block.max}</span></div>
          <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden"><div style="background:${gaugeColor};height:100%;width:${pct}%"></div></div>
          ${block.sub ? `<div style="font-size:11px;color:#666;margin-top:6px">${block.sub}</div>` : ""}
        </div></div>`;
      }
      case "bar_chart": {
        if (!block.items?.length) return "";
        const maxVal = Math.max(1, ...block.items.map(it => Math.abs(it.value)));
        const bars = block.items.map(it => {
          const color = block.mode === "score" ? scoreHexColor(it.value) : "#003B29";
          return `<div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span>${it.label}</span><strong style="color:#1C1C1C">${it.value}</strong></div>
            <div style="background:#f3f4f6;border-radius:999px;height:10px;overflow:hidden"><div style="background:${color};height:100%;width:${(Math.abs(it.value) / maxVal) * 100}%;border-radius:999px"></div></div>
          </div>`;
        }).join("");
        return `<div class="section">${block.title ? `<h2>${block.title}</h2>` : ""}${bars}</div>`;
      }
      case "pie_chart": {
        if (!block.items?.length) return "";
        const total = block.items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1;
        const dominant = block.items.reduce((a, b) => (b.value > a.value ? b : a), block.items[0]);
        const dominantPct = Math.round((dominant.value / total) * 100);
        const legend = block.items.map((it, j) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px">
          <span style="width:10px;height:10px;background:${CHART_COLORS[j % CHART_COLORS.length]};border-radius:2px;display:inline-block"></span>
          <span>${it.label}</span><strong style="margin-left:auto;color:#1C1C1C">${it.value}</strong>
        </div>`).join("");
        let cumulative = 0;
        const segments = block.items.map((it, j) => {
          const pct = (Math.max(0, it.value) / total) * 100;
          const circle = `<circle cx="18" cy="18" r="15.9" fill="none" stroke="${CHART_COLORS[j % CHART_COLORS.length]}" stroke-width="4" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-cumulative}" transform="rotate(-90 18 18)"></circle>`;
          cumulative += pct;
          return circle;
        }).join("");
        const donutSvg = `<svg width="120" height="120" viewBox="0 0 36 36" style="flex-shrink:0">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F5F5F5" stroke-width="4"></circle>
          ${segments}
        </svg>`;
        return `<div class="section">${block.title ? `<h2>${block.title}</h2>` : ""}
          <p style="font-size:12px;color:#666;margin:0 0 8px"><strong style="color:#1C1C1C">${dominant.value} з ${total} (${dominantPct}%)</strong> — ${dominant.label.toLowerCase()}</p>
          <div style="display:flex;align-items:center;gap:20px">${donutSvg}<div>${legend}</div></div></div>`;
      }
      case "ranked_list": {
        if (!block.items?.length) return "";
        const rows = block.items.map((it, j) => `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>${j + 1}. ${it.label}</span>
            <strong style="color:#1C1C1C">${it.score}${it.trend ? ` ${TREND_ARROW_HTML[it.trend]}` : ""}</strong>
          </div>
          <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden"><div style="background:${scoreHexColor(it.score)};height:100%;width:${Math.min(100, Math.max(0, it.score))}%"></div></div>
        </div>`).join("");
        return `<div class="section">${block.title ? `<h2>${block.title}</h2>` : ""}${rows}</div>`;
      }
      case "table": {
        if (!block.headers?.length || !block.rows?.length) return "";
        const distinctTypes = new Set(block.rows.map(r => r.rowType).filter(Boolean));
        const hasType = distinctTypes.size > 1;
        return `<div class="section">${block.title ? `<p style="font-size:12px;font-weight:bold;color:#666;margin-bottom:6px">${block.title}</p>` : ""}
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr>
              ${hasType ? `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#003B29">Оцінка</th>` : ""}
              ${block.headers.map(h => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#003B29">${h}</th>`).join("")}
            </tr></thead>
            <tbody>${block.rows.map(row => `<tr>
              ${hasType && row.rowType ? `<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6"><span style="font-size:10px;font-weight:bold;color:${ROW_TYPE_HEX[row.rowType]};border:1px solid ${ROW_TYPE_HEX[row.rowType]};border-radius:10px;padding:1px 6px">${ROW_TYPE_LABEL_HTML[row.rowType]}</span></td>` : ""}
              ${row.cells.map(c => `<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${c}</td>`).join("")}
            </tr>`).join("")}</tbody>
          </table>
        </div>`;
      }
      case "two_column_list": {
        const leftTone = TONE_HEX[sentimentTone(block.leftTitle)];
        const rightTone = TONE_HEX[sentimentTone(block.rightTitle)];
        return `<div class="section" style="display:flex;gap:16px">
          <div style="flex:1;background:${leftTone.bg};border:1px solid ${leftTone.border};border-radius:8px;padding:12px 14px">
            <h2 style="color:${leftTone.heading};border-bottom-color:${leftTone.border}">${block.leftTitle}</h2>
            <ul>${block.left.map(item => `<li style="margin-bottom:6px">${item}</li>`).join("")}</ul>
          </div>
          <div style="flex:1;background:${rightTone.bg};border:1px solid ${rightTone.border};border-radius:8px;padding:12px 14px">
            <h2 style="color:${rightTone.heading};border-bottom-color:${rightTone.border}">${block.rightTitle}</h2>
            <ul>${block.right.map(item => `<li style="margin-bottom:6px">${item}</li>`).join("")}</ul>
          </div>
        </div>`;
      }
      case "theme_section": {
        if (!block.items?.length) return "";
        const items = block.items.map(it => {
          const tone = it.kind ? KIND_TONE_HTML[it.kind] : { bg: "#f9fafb", border: "#e5e7eb" };
          return `<div style="background:${tone.bg};border:1px solid ${tone.border};border-radius:6px;padding:10px 12px;margin-bottom:8px">
            ${it.kind ? `<div style="font-size:10px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">${KIND_LABEL_HTML[it.kind]}</div>` : ""}
            <div style="font-weight:bold;color:#1C1C1C;font-size:12px;margin-bottom:2px">${it.label}</div>
            <div style="color:#444;font-size:12px">${it.text}</div>
          </div>`;
        }).join("");
        return `<div class="section"><h2>${block.title}</h2>${items}</div>`;
      }
      case "zone_trend": {
        if (!block.points?.length) return "";
        const zoneHex: Record<"red" | "yellow" | "green", string> = { red: "#EF4444", yellow: "#FBBF24", green: "#10B981" };
        const rows = block.points.map(p => {
          const segs = p.total === 0
            ? `<div style="background:#e5e7eb;height:100%;width:100%"></div>`
            : (["red", "yellow", "green"] as const).map(z => p[z] > 0
                ? `<div style="background:${zoneHex[z]};height:100%;width:${(p[z] / p.total) * 100}%;display:inline-block"></div>` : "").join("");
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="font-size:11px;color:#666;width:44px;flex-shrink:0">${p.label}</span>
            <div style="flex:1;height:12px;border-radius:6px;overflow:hidden;background:#f3f4f6;display:flex">${segs}</div>
            <span style="font-size:10px;color:#999;width:20px;text-align:right;flex-shrink:0">${p.total || "—"}</span>
          </div>`;
        }).join("");
        return `<div class="section">${block.title ? `<h2>${block.title}</h2>` : ""}${rows}</div>`;
      }
      default:
        return "";
    }
  }).join("");
}

export function exportInsightPDF(item: any, itemNumber: number | string, showCost: boolean = true) {
  const date = new Date(item.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const typeLabel = item.type === "call" ? "Дзвінки" : item.type === "meeting" ? "Зустрічі" : "Всі";
  const sourceLabel = item.data_source === "transcripts" ? "Сирі транскрипції" : "Результати аналізу";

  const pdfNameTokens = extractNameTokens(typeof item.managersLabel === "string" ? item.managersLabel.split(", ") : []);
  const pdfFindingPattern = new RegExp(`(${FINDING_NUMBER_SOURCE}${pdfNameTokens.length ? "|" + pdfNameTokens.map(escapeRegExp).join("|") : ""})`, "g");
  const boldFindingNumbers = (s: string) => s.replace(pdfFindingPattern, "<strong>$1</strong>");
  const FINDING_TONE_HEX: Record<string, { bg: string; border: string; mark: string }> = {
    negative: { bg: "#fef2f2", border: "#fecaca", mark: "▼" },
    warning: { bg: "#fffbeb", border: "#fde68a", mark: "!" },
    positive: { bg: "#ecfdf5", border: "#a7f3d0", mark: "✓" },
    neutral: { bg: "#f9fafb", border: "#e5e7eb", mark: "→" },
  };
  const findingsHtml = splitListItems(item.key_findings).map((f: string) => {
    const tone = FINDING_TONE_HEX[findingTone(f)];
    return `<div style="background:${tone.bg};border:1px solid ${tone.border};border-radius:6px;padding:8px 10px;margin-bottom:6px">${tone.mark} ${boldFindingNumbers(f)}</div>`;
  }).join("");

  const recsHtml = splitListItems(item.recommendations).map((r: string, i: number) =>
    `<li style="margin-bottom:6px"><strong>${i + 1}.</strong> ${stripLeadingNumber(r)}</li>`).join("");

  const byManagerHtml = (item.by_manager ?? []).map((m: { name: string; insight: string }) =>
    `<div style="margin-bottom:10px"><strong>${m.name}:</strong> ${m.insight}</div>`).join("");

  const quotesHtml = (item.quotes ?? []).map((q: { manager: string; text: string; context: string; conversationId?: string }) =>
    `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:8px">
      <div style="font-weight:bold;color:#003B29;margin-bottom:4px;font-size:12px">${q.manager}${q.context ? ` · ${q.context}` : ""}</div>
      <div style="font-style:italic;color:#444">«${q.text}»</div>
    </div>`).join("");

  const chartRaw: { label: string; count: number }[] = item.chart_data ?? [];
  const chartTotal = chartRaw.reduce((s, r) => s + r.count, 0) || 1;
  const chartHtml = chartRaw.map((r, i) => {
    const pct = Math.round((r.count / chartTotal) * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<div style="margin-bottom:8px">
      <div style="font-size:12px;margin-bottom:2px">${r.label} <strong>${pct}% (${r.count})</strong></div>
      <div style="background:#f3f4f6;border-radius:999px;height:8px;overflow:hidden">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:999px"></div>
      </div>
    </div>`;
  }).join("");

  const blocksHtml = renderBlocksHtml(item.blocks ?? []);

  const table = item.table_data as TableData | null | undefined;
  const tableHtml = table && table.headers?.length && table.rows?.length
    ? `${table.title ? `<p style="font-size:12px;font-weight:bold;color:#666;margin-bottom:6px">${table.title}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${table.headers.map((h: string) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#003B29">${h}</th>`).join("")}</tr></thead>
        <tbody>${table.rows.map((row: string[]) => `<tr>${row.map(c => `<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`
    : "";

  const cs = item.computed_stats as { current?: ComputedStats | null; previous?: ComputedStats | null; previousRangeLabel?: string | null } | undefined;
  const statsHtml = cs?.current && (cs.current.overallCount > 0 || cs.current.byManager.length > 0)
    ? `<p style="font-size:13px;margin-bottom:6px">Середній бал: <strong style="color:#1C1C1C">${cs.current.overallAvgScore ?? "—"}</strong> (${cs.current.overallCount} розмов)${cs.previous ? ` · попередній період (${cs.previousRangeLabel}): ${cs.previous.overallAvgScore ?? "—"}` : ""}</p>
      ${cs.current.byManager.length > 1 ? cs.current.byManager.map(m => `<div style="font-size:12px;margin-bottom:3px">${m.name}: <strong style="color:#1C1C1C">${m.avgScore}</strong> (${m.count})</div>`).join("") : ""}`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Інсайт #${itemNumber} — lumi.ai</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 820px; margin: 40px auto; color: #1C1C1C; font-size: 14px; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  h1 { font-size: 18px; color: #003B29; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 12px; }
  .meta span { margin-right: 12px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; background:#f0fdf4; color:#003B29; border:1px solid #d1fae5; margin-right:6px; }
  .query-block { background:#F8FAFC; border:1px solid #E2E8F0; border-left:4px solid #CBD5E1; border-radius:10px; padding:12px 16px; margin-bottom:16px; }
  .query-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748B; margin-bottom:4px; }
  .query-text { font-size:12px; color:#333; line-height:1.5; white-space:pre-wrap; }
  .chip { display:inline-flex; align-items:baseline; gap:5px; padding:4px 10px; border-radius:8px; font-size:11px; margin-right:8px; margin-bottom:8px; border:1px solid; }
  .chip-label { font-weight:700; text-transform:uppercase; font-size:9px; opacity:.7; letter-spacing:.03em; }
  .chip-slate { background:#f8fafc; border-color:#e2e8f0; color:#475569; }
  .chip-blue { background:rgba(239,88,61,0.08); border-color:rgba(239,88,61,0.25); color:#C8452E; }
  .chip-amber { background:#fffbeb; border-color:#fde68a; color:#b45309; }
  .section { margin-top: 20px; }
  .section h2 { font-size: 13px; font-weight: bold; color: #003B29; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .summary { background: #f0fdf4; border-left: 3px solid #003B29; padding: 12px 16px; border-radius: 4px; font-size: 13px; }
  ul { padding-left: 0; list-style: none; }
  .footer { margin-top: 40px; font-size: 11px; color: #aaa; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print {
    body { margin: 20px; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  }
</style></head><body>
${(() => {
  const badgeText = typeof itemNumber === "number" ? String(itemNumber) : "✨";
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
  <div style="width:32px;height:32px;shrink:0;background:#003B29;color:white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px">${badgeText}</div>
  <div>
    <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.05em">lumi.ai · Інсайт #${itemNumber}</div>
    <div style="font-size:11px;color:#666">${date}</div>
  </div>
</div>`;
})()}
<h1>${item.title || item.question}</h1>
${item.title ? `<div class="query-block"><div class="query-label">Запит до AI</div><div class="query-text">${item.question}</div></div>` : ""}
<div class="meta">
  <span>${item.analyzed_count} розмов</span>
  ${item.date_from ? `<span>${item.date_from} — ${item.date_to}</span>` : ""}
  <span>Тип: ${typeLabel}</span>
  <span class="badge">${sourceLabel}</span>
  ${showCost && typeof item.cost_usd === "number" ? `<span>$${item.cost_usd.toFixed(2)}</span>` : ""}
</div>
<div>
  ${item.managersLabel ? `<span class="chip chip-slate"><span class="chip-label">Команда</span>${item.managersLabel}</span>` : ""}
  ${item.servicesLabel ? `<span class="chip chip-blue"><span class="chip-label">Послуги</span>${item.servicesLabel}</span>` : ""}
  ${item.kindsLabel ? `<span class="chip chip-amber"><span class="chip-label">Тип розмови</span>${item.kindsLabel}</span>` : ""}
</div>
${item.summary ? `<div class="section"><h2>Висновок AI</h2><div class="summary">${item.summary}</div></div>` : ""}
${findingsHtml ? `<div class="section"><h2>Ключові знахідки</h2><div>${findingsHtml}</div></div>` : ""}
${blocksHtml}
${chartHtml ? `<div class="section"><h2>Розподіл за частотою</h2>${chartHtml}</div>` : ""}
${tableHtml ? `<div class="section">${tableHtml}</div>` : ""}
${statsHtml ? `<div class="section"><h2>Реальні дані з бази</h2>${statsHtml}</div>` : ""}
${byManagerHtml ? `<div class="section"><h2>По менеджерах</h2>${byManagerHtml}</div>` : ""}
${quotesHtml ? `<div class="section"><h2>Приклади з транскрипцій</h2>${quotesHtml}</div>` : ""}
${recsHtml ? `<div class="section"><h2>Рекомендації</h2><ul>${recsHtml}</ul></div>` : ""}
<div class="footer">Згенеровано: ${date} · lumi.ai</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  let printed = false;
  const doPrint = () => { if (printed) return; printed = true; win.print(); };
  win.onload = () => setTimeout(doPrint, 150);
  setTimeout(doPrint, 700);
}
