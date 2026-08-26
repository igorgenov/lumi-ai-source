"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";
import { BrandCheck, BrandArrowRight } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { cn, parseServices, FILTERABLE_CONVERSATION_KINDS, scoreBarColor, scoreHexColor, SCORE_ZONES } from "@/lib/utils";
import { useManagers } from "@/hooks/useManagers";
import { useConversations } from "@/hooks/useConversations";
import { DateRangePicker, DateRange, currentWeekRange } from "@/components/ui/date-range-picker";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Sparkles, Play, Phone, Video, Users, ChevronDown,
  Clock, AlertTriangle, MessageSquare, BarChart3, TrendingUp,
  Quote, Lightbulb, Download, History, X, Zap, Info,
  Database, ScrollText, Lock, Table as TableIcon, Pin, ExternalLink, Loader2, HelpCircle, Send, Filter, Trash2,
} from "lucide-react";

// ── Token estimation helpers ──────────────────────────────────────────────────
const SERVICES = ["SEO", "GEO", "PPC", "Analytics", "ASO", "ASA", "Nonprofit"];
const CONTEXT_LIMIT = 1_000_000; // Claude Sonnet 5 context window
const TOKENS_PER_CALL_FALLBACK = 1_800; // used only if a matched conv has no transcript text yet
const TOKENS_PER_RESULT_LINE   = 150;   // "results" mode sends one compact summary line per conv
const SYSTEM_PROMPT_TOKENS     = 800;   // prompt overhead
const CHARS_PER_TOKEN          = 4;     // rough UA/EN text → token ratio

// Claude Sonnet 5 intro pricing through 2026-08-31 (afterwards $3/$15 standard) — update
// these two after that date.
const INPUT_PRICE_PER_M  = 2;
const OUTPUT_PRICE_PER_M = 10;
// Output size (the structured report — summary, findings, recommendations, blocks) is bounded
// by how much there is to meaningfully say, not by how much input went in — so it's roughly
// CONSTANT, not a percentage of input. A percentage-of-input guess was badly wrong at both ends:
// checked against two real bills, Insight #9 (~2.9k input / "results" mode) actually used ~3.3k
// output tokens, and Insight #8 (~353k input / "transcripts" mode) used only ~6k output tokens —
// a 20%-of-input assumption would have guessed ~580 for #9 (5x too low) and ~70k for #8 (12x too
// high). A flat estimate in the observed 3k-6k range fits both real cases far better.
const OUTPUT_TOKENS_ESTIMATE = 4000;
function estimateCost(inputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_PRICE_PER_M + (OUTPUT_TOKENS_ESTIMATE / 1_000_000) * OUTPUT_PRICE_PER_M;
}

function parseConvDate(dateStr: string): Date {
  const raw = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
  return new Date(raw);
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Objection  { label: string; count: number; pct: number; avgHandling: number; color: string }
export interface ManagerRow { name: string; insight: string }
export interface QuoteRow   { manager: string; client: string; text: string; conversationId?: string }
interface StatKpi    { label: string; value: string; sub?: string; color?: string }
export interface TableData  { title?: string | null; headers: string[]; rows: string[][] }
export interface ManagerStat { name: string; avgScore: number; count: number }
export interface ComputedStats { overallAvgScore: number | null; overallCount: number; byManager: ManagerStat[] }

interface Report {
  id: string;
  title?: string | null;
  blocks?: Block[] | null;
  question: string;
  analyzedCount: number;
  dateRange: string;
  type: string;
  managers: string[];
  services?: string[];
  kinds?: string[];
  generatedAt: string;
  summary: string;
  objections?: Objection[];
  byManager?: ManagerRow[];
  quotes?: QuoteRow[];
  kpis?: StatKpi[];
  recommendations: string[];
  keyFindings?: string[];
  costUsd?: number;
  dataSource?: "results" | "transcripts";
  dateFrom?: string;
  dateTo?: string;
  typeRaw?: "all" | "call" | "meeting" | "chat";
  chartDataRaw?: { label: string; count: number }[];
  tableData?: TableData | null;
  computedStats?: ComputedStats | null;
  previousComputedStats?: ComputedStats | null;
  previousRangeLabel?: string | null;
}

// Adapts the live (not-yet-saved) Report shape into the same shape exportInsightPDF expects from a DB row.
function reportToPdfItem(report: Report) {
  return {
    created_at: new Date().toISOString(),
    type: report.typeRaw ?? "all",
    data_source: report.dataSource ?? "results",
    question: report.question,
    analyzed_count: report.analyzedCount,
    date_from: report.dateFrom ?? null,
    date_to: report.dateTo ?? null,
    summary: report.summary,
    key_findings: report.keyFindings ?? [],
    recommendations: report.recommendations ?? [],
    by_manager: report.byManager ?? [],
    quotes: (report.quotes ?? []).map(q => ({ manager: q.manager, text: q.text, context: q.client, conversationId: q.conversationId })),
    chart_data: report.chartDataRaw ?? [],
    table_data: report.tableData ?? null,
    blocks: report.blocks ?? [],
    title: report.title ?? null,
    managersLabel: report.managers.join(", "),
    servicesLabel: (report.services ?? ["Усі послуги"]).join(", "),
    kindsLabel: (report.kinds ?? ["Усі типи розмов"]).join(", "),
    cost_usd: report.costUsd,
    computed_stats: { current: report.computedStats ?? null, previous: report.previousComputedStats ?? null, previousRangeLabel: report.previousRangeLabel ?? null },
  };
}

// ── Saved reports (will be populated from DB once AI pipeline is live) ───────
const SAVED_REPORTS: Report[] = [];

export const CHART_COLORS = ["#003B29", "#EF583D", "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#EC4899", "#14B8A6"];

// Claude sometimes collapses a list field into one string, occasionally wrapping items in
// pseudo-XML <item>...</item> tags — split those back into real list items. Applied at render
// time so already-saved history rows (from before this fix) also display cleanly.
function splitTaggedItems(s: string): string[] {
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

// A "ключові знахідки" list reads as one dense paragraph when every line is plain text of
// equal weight — bold the hard numbers (scores, percentages) so a scanning reader can find
// the concrete evidence in each line without reading the whole sentence.
const FINDING_NUMBER_SOURCE = "\\(\\d{1,3}\\/100\\)|\\d{1,3}\\/100|\\d{1,3}%";
const FINDING_NUMBER_MATCH = new RegExp(`^(${FINDING_NUMBER_SOURCE})$`);

// Manager full names ("Anastasiya Grechko") and their individual name parts ("Grechko" alone,
// as AI findings often refer to just the surname) both get bolded — full names first so a
// mention of the complete name highlights as one unit rather than splitting into two.
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

// Recommendations render with their own numbered badge/marker — but the AI sometimes prefixes
// its own "1. "/"1) " numbering inside the text too, producing a visible double-numbered line
// ("1. 1. Впровадити..."). Strip a leading number the AI added since the UI already supplies one.
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


// ── Shared UI ─────────────────────────────────────────────────────────────────
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

// ── Table (rendered only when Claude decides a table is the clearest format) ──
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

// ── Generic composable blocks ───────────────────────────────────────────────────
// AI picks whichever of these types (and however many) fit the specific question,
// instead of the report being forced into a fixed set of top-level fields.
interface BlockBase { type: string }
interface StatBlock extends BlockBase { type: "stat"; label: string; value: string; sub?: string }
interface GaugeBlock extends BlockBase { type: "gauge"; label: string; value: number; max: number; sub?: string }
interface BarChartBlock extends BlockBase { type: "bar_chart"; title?: string; mode: "count" | "score"; items: { label: string; value: number }[] }
interface PieChartBlock extends BlockBase { type: "pie_chart"; title?: string; items: { label: string; value: number }[] }
interface RankedListBlock extends BlockBase { type: "ranked_list"; title?: string; items: { label: string; score: number; trend?: "up" | "down" | "flat"; conversationId?: string }[] }
interface TableBlockRow { cells: string[]; rowType?: "positive" | "negative" | "risk" | "neutral"; conversationId?: string }
interface TableBlock extends BlockBase { type: "table"; title?: string; headers: string[]; rows: TableBlockRow[] }
interface TwoColumnBlock extends BlockBase { type: "two_column_list"; leftTitle: string; rightTitle: string; left: string[]; right: string[] }
interface ThemeSectionItem { label: string; text: string; kind?: "example_positive" | "example_negative" | "risk" | "observation" | "quote"; conversationId?: string }
interface ThemeSectionBlock extends BlockBase { type: "theme_section"; title: string; items: ThemeSectionItem[] }
// Server-injected only (see computeZoneTrend in api/insights/route.ts) — never offered to
// Claude's tool schema, so this never shows up as an AI-chosen type, only an auto-added one.
interface ZoneTrendPoint { label: string; red: number; yellow: number; green: number; total: number }
interface ZoneTrendBlock extends BlockBase { type: "zone_trend"; title?: string; points: ZoneTrendPoint[] }
export type Block = StatBlock | GaugeBlock | BarChartBlock | PieChartBlock | RankedListBlock | TableBlock | TwoColumnBlock | ThemeSectionBlock | ZoneTrendBlock;

const ROW_TYPE_STYLE: Record<string, string> = {
  positive: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  negative: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
  risk: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  neutral: "bg-secondary/60 text-muted-foreground border-border",
};
const ROW_TYPE_LABEL: Record<string, string> = { positive: "Гарний приклад", negative: "Проблема", risk: "Ризик", neutral: "Нейтрально" };
const KIND_META: Record<string, { label: string; className: string; cardClass: string }> = {
  example_positive: { label: "Позитивний приклад", className: "text-emerald-700 dark:text-emerald-400", cardClass: "bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30" },
  example_negative: { label: "Негативний приклад", className: "text-red-600 dark:text-red-400", cardClass: "bg-red-50/60 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" },
  risk: { label: "Ризик", className: "text-amber-700 dark:text-amber-400", cardClass: "bg-amber-50/60 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" },
  observation: { label: "Спостереження", className: "text-foreground", cardClass: "bg-secondary/20 border-border" },
  quote: { label: "Цитата", className: "text-accent-strong", cardClass: "bg-accent/6 border-accent/20" },
};

// Titles of two_column_list / theme_section blocks are free-text from the AI (e.g. "Ризики" vs
// "Можливості", "Системні проблеми" vs "Сильні сторони команди") — infer a semantic color tone
// from keywords so problems read red/amber and strengths read green, instead of everything
// sharing the same flat brand-purple heading regardless of meaning.
function sentimentTone(title: string): "positive" | "negative" | "neutral" {
  const t = title.toLowerCase();
  const neg = ["проблем", "ризик", "слабк", "недолік", "помилк", "втрат", "загроз", "відтік", "відмов", "прогалин", "негатив"];
  const pos = ["сильн", "перевал", "переваг", "можлив", "успіх", "добре", "плюс", "зростан", "покращ", "позитив"];
  if (neg.some(w => t.includes(w))) return "negative";
  if (pos.some(w => t.includes(w))) return "positive";
  return "neutral";
}
const TONE_CARD_CLASS: Record<string, string> = {
  positive: "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30",
  negative: "bg-red-50/50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
  neutral: "bg-card border-border",
};

// Key findings are flat AI-written sentences with no structured sentiment field — infer
// red (declining) / amber (unstable, needs a look) / green (a real strength) from the same
// kind of keyword cues sentimentTone uses for section titles, tuned for a full sentence.
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
const TONE_HEADING_CLASS: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  neutral: "text-foreground",
};
const TREND_ARROW: Record<string, string> = { up: "↗", down: "↘", flat: "→" };
const TREND_COLOR: Record<string, string> = { up: "text-emerald-600 dark:text-emerald-400", down: "text-red-500 dark:text-red-400", flat: "text-muted-foreground" };

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
            // Same convention as Dashboard's "Розподіл балів": only the bar/fill is colored by
            // score tier — the number itself stays neutral navy, never a per-score color.
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
            // Pull the dominant slice out as a plain-text headline so the takeaway doesn't
            // require reading and adding up the legend first.
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
            // A rowType badge only carries information when rows differ — if every row in
            // a "problem conversations" table is "negative", repeating that same badge on
            // every line says nothing the table's own numbers don't already say.
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

// ── Delta badge for period-over-period comparison ──────────────────────────────
// ── Original question, shown as its own distinct section (not hidden — see feedback that
// hiding it made the question feel optional when it's really the other half of the report).
// Long questions (multi-criteria prompts) collapse behind "Показати повністю" so one giant
// wall of instructions doesn't dominate the page above the actual findings.
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

// ── Real, DB-computed stats — grounds the AI text in hard numbers, not LLM-generated ──
export function ComputedStatsCard({ stats, previous, previousLabel, hideOverall }: { stats: ComputedStats; previous?: ComputedStats | null; previousLabel?: string | null; hideOverall?: boolean }) {
  if (stats.overallCount === 0 && stats.byManager.length === 0) return null;
  // hideOverall: the detail page already shows this exact overall-score/delta pair in its
  // sticky left rail — repeating it here too was the "same 54 vs 57 shown 3 times" duplication.
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
      {/* With exactly one manager, this would just repeat the overall number above in a
          second row labeled with their name — redundant, not a real "breakdown". */}
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

// ── Full report view ──────────────────────────────────────────────────────────
function ReportView({ report, onClose, allManagers = [], canEdit = true }: { report: Report; onClose?: () => void; allManagers?: { id: string; name: string }[]; canEdit?: boolean }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-primary/15 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Звіт · {report.generatedAt}</span>
              {canEdit && typeof report.costUsd === "number" && (
                <span className="text-[10px] font-bold text-primary"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>${report.costUsd.toFixed(2)}</span>
              )}
            </div>
            <h3 className="text-base font-black text-foreground leading-snug" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {report.title || report.question}
            </h3>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{report.analyzedCount} розмов</span>
              <span>·</span><span>{report.dateRange}</span>
              <span>·</span><span>Тип: {report.type}</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <FilterChip label="Команда" value={report.managers.join(", ")} color="slate" />
              <FilterChip label="Послуги" value={(report.services ?? ["Усі послуги"]).join(", ")} color="blue" />
              <FilterChip label="Тип розмови" value={(report.kinds ?? ["Усі типи розмов"]).join(", ")} color="amber" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => exportInsightPDF(reportToPdfItem(report), "Новий", canEdit)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg
              text-muted-foreground hover:text-primary hover:border-primary/30 bg-card transition-colors"
              style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            {onClose && (
              <button onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Запит до AI — always visible when there's a distinct title (otherwise the heading
            above already IS the question, so repeating it here would just be a duplicate). */}
        {report.title && <div className="mt-4"><QueryBlock question={report.question} /></div>}

        {/* AI summary */}
        <div className="mt-4 bg-secondary border border-border border-l-4 border-l-[#003B29] rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Sparkles className="w-3.5 h-3.5 text-accent-strong" /> Висновок AI
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            {report.summary}
          </p>
          {splitListItems(report.keyFindings).length > 0 && (
            <div className="mt-3 space-y-2">
              {splitListItems(report.keyFindings).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/80 bg-card/70 border border-primary/10 rounded-lg px-3 py-2" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                  <span className="text-accent font-black shrink-0 mt-0.5">→</span>
                  <span><FindingText text={f} nameTokens={extractNameTokens(report.managers)} /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI row if present */}
      {report.kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {report.kpis.map((k, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{k.label}</p>
              <p className="text-2xl font-black" style={{ fontFamily: "var(--font-unbounded), sans-serif", color: k.color ?? "#003B29" }}>
                {k.value}
              </p>
              {k.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Objections chart + manager table */}
      {((report.objections && report.objections.length > 0) || (report.byManager && report.byManager.length > 0)) && (
        <div className={cn("grid gap-4", (report.objections?.length ?? 0) > 0 && (report.byManager?.length ?? 0) > 0 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
          {report.objections && report.objections.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {report.id === "r2" ? "Причини відмов" : "Заперечення за частотою"}
                </h4>
              </div>
              <HBarChart data={report.objections} />
              <p className="text-[10px] text-muted-foreground mt-2" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                % від загальної кількості розмов · у дужках — кількість
              </p>
            </div>
          )}

          {report.byManager && report.byManager.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-foreground" />
                <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>По менеджерах</h4>
              </div>
              <div className="space-y-3">
                {report.byManager.map((m, i) => {
                  const manager = allManagers.find(am => am.name === m.name);
                  return (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{m.name.charAt(0)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            {m.name}
                          </p>
                          {manager && (
                            <Link href={`/coaching/plans?manager=${manager.id}`}
                              className="text-[11px] font-semibold text-primary hover:underline shrink-0 whitespace-nowrap">
                              План коучингу →
                            </Link>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{m.insight}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <BlockRenderer blocks={report.blocks} />
      {report.tableData && <TableCard table={report.tableData} />}
      {report.computedStats && (
        <ComputedStatsCard stats={report.computedStats} previous={report.previousComputedStats} previousLabel={report.previousRangeLabel} />
      )}

      {/* Quotes */}
      {report.quotes && report.quotes.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Quote className="w-4 h-4 text-accent-strong" />
            <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Приклади з транскрипцій
            </h4>
          </div>
          <div className="space-y-3">
            {report.quotes.map((q, i) => (
              <div key={i} className={cn("rounded-xl p-4 border bg-secondary/20 border-border", q.conversationId && "hover:border-primary/40 transition-colors")}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-white text-[10px] font-black shrink-0"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{q.manager.charAt(0)}</div>
                  <span className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{q.manager}</span>
                  {q.client && <span className="text-xs text-muted-foreground">· {q.client}</span>}
                </div>
                <p className="text-sm italic text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                  «{q.text}»
                </p>
                {q.conversationId && (
                  <Link href={`/conversations/${q.conversationId}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary underline hover:text-primary-hover">
                    <ExternalLink className="w-3 h-3" /> Переглянути розмову
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-4 h-4 text-accent-strong" />
          <h4 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Рекомендації AI</h4>
        </div>
        <div className="space-y-2">
          {splitListItems(report.recommendations).map((r, i) => (
            <div key={i} className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-secondary/40 transition-colors">
              <RankBadge rank={i + 1} className="w-5 h-5 mt-0.5" />
              <p className="text-sm text-foreground leading-snug" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{stripLeadingNumber(r)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Token meter ───────────────────────────────────────────────────────────────
function TokenMeter({
  convCount, tokens, type, estimating,
}: {
  convCount: number;
  tokens: number;
  type: "all" | "call" | "meeting" | "chat";
  estimating?: boolean;
}) {
  const pct = Math.min((tokens / CONTEXT_LIMIT) * 100, 100);
  const fits = tokens <= CONTEXT_LIMIT;
  const isWarn = pct > 70 && fits;

  const barColor = estimating ? "bg-muted-foreground/30" : !fits ? "bg-red-500" : isWarn ? "bg-amber-400" : "bg-primary";
  const textColor = estimating ? "text-muted-foreground" : !fits ? "text-red-600 dark:text-red-400" : isWarn ? "text-amber-600 dark:text-amber-400" : "text-primary";
  const bgColor = "bg-secondary/40 border-border";

  const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

  return (
    <div className={cn("rounded-xl border px-4 py-3 space-y-2", bgColor)}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: conv count */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Розмов у вибірці:
            </span>
            <span className="font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {convCount}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Токенів:
            </span>
            {estimating ? (
              <span className={cn("font-black flex items-center gap-1", textColor)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <Loader2 className="w-3 h-3 animate-spin" /> рахуємо…
              </span>
            ) : (
              <span className={cn("font-black", textColor)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                ~{fmtK(tokens)}
              </span>
            )}
            <span className="text-muted-foreground/60" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              / {fmtK(CONTEXT_LIMIT)} ліміт
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Використання контексту:
            </span>
            <span className={cn("font-black", textColor)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {estimating ? "…" : `${pct.toFixed(1)}%`}
            </span>
          </div>
        </div>

        {/* Right: status badge */}
        <span className={cn(
          "text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0",
          estimating
            ? "bg-secondary text-muted-foreground border-border"
            : !fits
              ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30"
              : isWarn
                ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30"
                : "bg-emerald-100 dark:bg-emerald-500/15 text-primary-hover border-emerald-200 dark:border-emerald-500/30"
        )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {estimating ? "Рахуємо точний обсяг…" : !fits ? "⚠ Перевищує ліміт" : isWarn ? "⚠ Близько до ліміту" : "✓ Вміщується в контекст"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-card/70 rounded-full overflow-hidden border border-black/5">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: estimating ? "100%" : `${pct}%` }}
        />
      </div>

      {/* Hint */}
      {estimating && (
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Рахуємо реальний обсяг токенів по вибраних транскрипціях — секунда.
        </p>
      )}
      {!estimating && !fits && (
        <p className="text-[11px] text-red-600 dark:text-red-400 flex items-start gap-1.5" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Забагато розмов для одного запиту. Зменш діапазон дат, обери конкретних менеджерів або тип розмов.
        </p>
      )}
      {!estimating && isWarn && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Запит великий, але вміщується. Вартість ~${estimateCost(tokens).toFixed(2)} за один запит.
        </p>
      )}
      {!estimating && fits && !isWarn && (
        <p className="text-[11px] text-primary-hover flex items-start gap-1.5" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Вартість ~${estimateCost(tokens).toFixed(2)} за один запит через Claude API.
        </p>
      )}
    </div>
  );
}

// ── Saved report card ─────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ElementType> = {
  "Зустрічі": Video,
  "Дзвінки":  Phone,
  "Чати":     Send,
  "Всі":      MessageSquare,
};

function SavedReportCard({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[report.type] ?? MessageSquare;

  return (
    <div className={cn(
      "bg-card border rounded-xl transition-all duration-150",
      open ? "border-primary/20 shadow-md" : "border-border hover:border-primary/20"
    )}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-5 text-left"
      >
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
          open ? "bg-primary text-white" : "bg-primary/8 text-primary"
        )}>
          <BarChart3 className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-primary leading-snug" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {report.question}
          </p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Icon className="w-3 h-3" />{report.type}</span>
            <span>·</span>
            <span>{report.dateRange}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{report.analyzedCount} розмов</span>
            <span>·</span>
            <span>{report.generatedAt}</span>
          </div>
        </div>

        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {/* Expanded report */}
      {open && (
        <div className="px-5 pb-5">
          <div className="border-t border-border pt-5">
            <ReportView report={report} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── PDF export ────────────────────────────────────────────────────────────────
// ── Blocks → static HTML for the print/PDF window (no Tailwind there — plain inline styles,
// mirroring the on-screen colors/spacing so the saved PDF isn't a stripped-down version) ──
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

function renderBlocksHtml(blocks: Block[]): string {
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
        // Same convention as Dashboard's "Розподіл балів": only the bar/fill is colored by
        // score tier — the number itself stays neutral navy.
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
        // SVG ring (r=15.9 → circumference ≈100, so percentages map directly to
        // stroke-dasharray units) — print/PDF-safe, unlike a CSS conic-gradient hack.
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
  // Wait for the injected content (chart bars etc.) to actually finish loading/laying out
  // before printing — a fixed short delay sometimes fires before reflow completes, which
  // silently drops the last-added blocks (e.g. the chart) from the print output.
  let printed = false;
  const doPrint = () => { if (printed) return; printed = true; win.print(); };
  win.onload = () => setTimeout(doPrint, 150);
  setTimeout(doPrint, 700);
}

// ── History card (collapsible) ────────────────────────────────────────────────
function HistoryCard({ item, itemNumber, onTogglePin, onDelete, allManagers, canEdit }: { item: any; itemNumber: number | string; onTogglePin: (item: any) => void; onDelete: (item: any) => void; allManagers: { id: string; name: string }[]; canEdit: boolean }) {
  const confirm = useConfirm();

  const typeLabel = item.type === "call" ? "Дзвінки" : item.type === "meeting" ? "Зустрічі" : null;
  const date = new Date(item.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // manager_ids has always been stored; services/kinds are newer columns — if the field is
  // missing entirely (older saved insight, before this migration), don't claim "all" since we
  // genuinely don't know what was filtered — just omit that chip instead of showing a wrong one.
  const managerIds: string[] = Array.isArray(item.manager_ids) ? item.manager_ids : [];
  const managerNames = managerIds.map(id => allManagers.find(m => m.id === id)?.name ?? id);
  // "Всі менеджери"/"Усі послуги"/"Усі типи розмов" mean no filter was actually applied — showing
  // that as a chip reads like real information but says nothing, so only render a chip when a
  // real, specific filter was set.
  const managersLabel = managerIds.length === 0 ? null : managerNames.join(", ");
  const servicesLabel = Array.isArray(item.services) && item.services.length > 0 ? item.services.join(", ") : null;
  const kindsLabel = Array.isArray(item.kinds) && item.kinds.length > 0 ? item.kinds.join(", ") : null;

  // Compact row only — the full report (blocks/tables/quotes) lives on its own page
  // (/insights/[id]) now, so opening one no longer pushes the whole history list around.
  return (
    <div className="bg-card border border-border rounded-xl transition-all duration-150 hover:border-primary/20">
      <Link href={`/insights/${item.id}`} className="w-full flex items-center gap-3 p-5 text-left">
        <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center shrink-0"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{itemNumber}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary leading-snug" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {item.title || item.question}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <span>{date}</span>
            {item.created_by && <><span>·</span><span>{item.created_by}</span></>}
            {canEdit && typeof item.cost_usd === "number" && (
              <span className="font-bold text-primary">${item.cost_usd.toFixed(2)}</span>
            )}
            <span>·</span>
            <span>{item.analyzed_count} розмов</span>
            {item.date_from && <><span>·</span><span>{item.date_from} — {item.date_to}</span></>}
            {typeLabel && <><span>·</span><span>{typeLabel}</span></>}
            {item.data_source && (
              <span className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border",
                item.data_source === "transcripts"
                  ? "bg-primary/8 text-primary border-primary/20"
                  : "bg-accent/15 text-accent-strong border-accent/30"
              )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {item.data_source === "transcripts" ? <ScrollText className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                {item.data_source === "transcripts" ? "Транскрипції" : "Результати аналізу"}
              </span>
            )}
          </div>
          {(managersLabel || servicesLabel || kindsLabel) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {managersLabel && <FilterChip label="Команда" value={managersLabel} color="slate" />}
              {servicesLabel && <FilterChip label="Послуги" value={servicesLabel} color="blue" />}
              {kindsLabel && <FilterChip label="Тип розмови" value={kindsLabel} color="amber" />}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onTogglePin(item); }}
              className={cn(
                "p-2 rounded-lg border transition-colors",
                item.pinned
                  ? "text-primary border-primary/40 bg-primary/8"
                  : "text-muted-foreground border-border hover:text-primary hover:border-primary/30 bg-card"
              )}
              title={item.pinned ? "Відкріпити" : "Закріпити нагорі"}>
              <Pin className={cn("w-3.5 h-3.5", item.pinned && "fill-current")} />
            </button>
          )}
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); exportInsightPDF({ ...item, managersLabel, servicesLabel, kindsLabel }, itemNumber, canEdit); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg
              text-muted-foreground hover:text-primary hover:border-primary/30 bg-card transition-colors"
            style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}
            title="Зберегти PDF">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          {canEdit && (
            <button
              onClick={async e => {
                e.preventDefault();
                e.stopPropagation();
                const ok = await confirm({
                  title: "Видалити цей звіт?",
                  description: `«${item.title || item.question}» — дію буде видно в Журналі змін, але сам звіт відновити не можна.`,
                });
                if (ok) onDelete(item);
              }}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 dark:text-red-400 hover:border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:bg-red-500/10 bg-card transition-colors"
              title="Видалити звіт">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <BrandArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const { data: session } = useSession();
  const role = useEffectiveRole();
  const canCreate = role === "owner" || role === "admin";
  const { managers: allManagers } = useManagers();
  const realManagers = allManagers.filter(m => m.role === "pm");
  const { conversations: allConvs } = useConversations();
  const [question, setQuestion]                   = useState("");
  const [dateRange, setDateRange]                 = useState<DateRange>(currentWeekRange);
  const [typeFilter, setTypeFilter]               = useState<"all" | "call" | "meeting" | "chat">("all");
  const [selectedManagers, setSelectedManagers]   = useState<string[]>([]);
  const [managersOpen, setManagersOpen]           = useState(false);
  const [selectedServices, setSelectedServices]   = useState<string[]>([]);
  const [servicesOpen, setServicesOpen]           = useState(false);
  const [selectedKinds, setSelectedKinds]         = useState<string[]>([]);
  const [kindsOpen, setKindsOpen]                 = useState(false);
  const [dataSource, setDataSource]               = useState<"results" | "transcripts">("results");
  const [comparePrevious, setComparePrevious]     = useState(false);
  const managersRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const kindsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (managersRef.current && !managersRef.current.contains(e.target as Node)) {
        setManagersOpen(false);
      }
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
      if (kindsRef.current && !kindsRef.current.contains(e.target as Node)) {
        setKindsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [loading, setLoading]                     = useState(false);
  const [report, setReport]                       = useState<Report | null>(null);
  const [apiError, setApiError]                   = useState<string>("");
  const [progress, setProgress]                   = useState(0);
  const [progressLabel, setProgressLabel]         = useState("");
  const [history, setHistory]                     = useState<any[]>([]);
  const [historyPage, setHistoryPage]             = useState(1);
  const HISTORY_PAGE_SIZE = 5;

  useEffect(() => {
    fetch("/api/insights").then(r => r.json()).then(data => {
      if (data.insights) setHistory(data.insights);
    }).catch(() => {});
  }, [report]); // reload history after new report is saved

  // Stable numbering by creation order (oldest = 1), independent of the pinned-first
  // display order — so pinning an item to the top never changes its number.
  const historyNumbers = useMemo(() => {
    const byDate = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const map = new Map<string, number>();
    byDate.forEach((item, idx) => map.set(item.id, idx + 1));
    return map;
  }, [history]);

  function toggleManager(id: string) {
    setSelectedManagers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleService(svc: string) {
    setSelectedServices(prev => prev.includes(svc) ? prev.filter(x => x !== svc) : [...prev, svc]);
  }

  function toggleKind(kind: string) {
    setSelectedKinds(prev => prev.includes(kind) ? prev.filter(x => x !== kind) : [...prev, kind]);
  }

  async function togglePin(item: any) {
    const nextPinned = !item.pinned;
    setHistory(prev => {
      const updated = prev.map(h => h.id === item.id ? { ...h, pinned: nextPinned } : h);
      return [...updated].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    });
    try {
      await fetch("/api/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, pinned: nextPinned }),
      });
    } catch { /* optimistic update already applied; a failed toggle just won't persist */ }
  }

  async function deleteInsight(item: any) {
    const prev = history;
    setHistory(h => h.filter(x => x.id !== item.id));
    try {
      const res = await fetch("/api/insights", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      setHistory(prev); // roll back the optimistic removal if the request failed
    }
  }

  async function handleRun() {
    if (!question.trim()) return;
    setReport(null);
    setApiError("");
    setLoading(true);
    setProgress(10);
    setProgressLabel("Завантажуємо розмови з бази…");

    const fmt = fmtDate;

    try {
      setProgress(30);
      setProgressLabel("Формуємо контекст для AI…");

      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          dateFrom: fmt(dateRange.from),
          dateTo: fmt(dateRange.to),
          managerIds: selectedManagers,
          services: selectedServices,
          kinds: selectedKinds,
          type: typeFilter,
          dataSource,
          comparePrevious,
        }),
      });

      setProgress(80);
      setProgressLabel("AI аналізує та формує звіт…");

      const data = await res.json();

      if (!res.ok) {
        setApiError(data.error ?? "Невідома помилка");
        return;
      }

      // Map API response → Report shape
      const id = `r_${Date.now()}`;
      const now = new Date().toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      setReport({
        id,
        title: data.title ?? null,
        blocks: data.blocks ?? [],
        question: data.question,
        analyzedCount: data.analyzedCount,
        dateRange: data.dateRange,
        type: typeFilter === "all" ? "Всі" : typeFilter === "call" ? "Дзвінки" : typeFilter === "meeting" ? "Зустрічі" : "Чати",
        managers: selectedManagers.length === 0 ? ["Всі менеджери"] : realManagers.filter(m => selectedManagers.includes(m.id)).map(m => m.name),
        services: selectedServices.length === 0 ? ["Усі послуги"] : selectedServices,
        kinds: selectedKinds.length === 0 ? ["Усі типи розмов"] : selectedKinds,
        generatedAt: now,
        summary: data.summary ?? "",
        recommendations: data.recommendations ?? [],
        kpis: undefined,
        objections: toChartObjections(data.chartData),
        byManager: (data.byManager ?? []).map((b: { name: string; insight: string }) => ({
          name: b?.name ?? "—",
          insight: b?.insight ?? "",
        })),
        quotes: (data.quotes ?? []).map((q: { manager: string; text: string; context: string; conversationId?: string }) => ({
          manager: q?.manager ?? "—",
          client: q?.context ?? "",
          text: q?.text ?? "",
          conversationId: q?.conversationId,
        })),
        keyFindings: data.keyFindings ?? [],
        costUsd: data.costUsd,
        dataSource,
        dateFrom: fmt(dateRange.from),
        dateTo: fmt(dateRange.to),
        typeRaw: typeFilter,
        chartDataRaw: data.chartData ?? [],
        tableData: data.tableData ?? null,
        computedStats: data.computedStats ?? null,
        previousComputedStats: data.previousComputedStats ?? null,
        previousRangeLabel: data.previousRangeLabel ?? null,
      } as Report & { keyFindings: string[] });

      setProgress(100);
    } catch (e: any) {
      setApiError(e.message ?? "Помилка мережі");
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  }

  const selectedManagerNames = selectedManagers.length === 0
    ? "Всі менеджери"
    : realManagers.filter(m => selectedManagers.includes(m.id)).map(m => m.name.split(" ")[0]).join(", ");

  // Token estimation from the ACTUAL conversations matching the current filters —
  // same criteria the POST request will use — so the number on screen is real,
  // not a statistical guess. This is what's billed via Claude API.
  const matchedConvs = allConvs.filter(c => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (selectedManagers.length > 0 && !selectedManagers.includes(c.manager_id ?? "")) return false;
    if (selectedServices.length > 0 && !parseServices(c.service).some(s => selectedServices.includes(s))) return false;
    if (selectedKinds.length > 0 && !selectedKinds.includes((c as any).conversation_kind)) return false;
    if (dateRange.from || dateRange.to) {
      if (!c.date) return false;
      const d = parseConvDate(c.date);
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
    }
    return true;
  });
  const estConvCount = matchedConvs.length;

  // /api/dashboard (the source of allConvs) never sends transcript text — it's too heavy
  // for a payload used everywhere in the app — so a client-side estimate from matchedConvs
  // always falls back to TOKENS_PER_CALL_FALLBACK per conversation and badly undercounts
  // real transcripts (which run tens of thousands of characters). "Results" mode has the same
  // problem in miniature: its flat TOKENS_PER_RESULT_LINE guess was never checked against a
  // real bill and turned out ~5x too low. So for BOTH modes we ask the server for a real count
  // instead, built from the exact same data the actual request will send.
  const [realInputTokens, setRealInputTokens] = useState<number | null>(null);
  // While true, the number in TokenMeter is either stale (from the previous filter set) or the
  // naive per-conv placeholder — never show it as if it were final, show a loading state instead.
  const [estimatingTokens, setEstimatingTokens] = useState(false);
  useEffect(() => {
    if (estConvCount === 0) { setRealInputTokens(null); setEstimatingTokens(false); return; }
    setEstimatingTokens(true);
    const timer = setTimeout(() => {
      fetch("/api/insights/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: fmtDate(dateRange.from), dateTo: fmtDate(dateRange.to),
          managerIds: selectedManagers, services: selectedServices, kinds: selectedKinds,
          type: typeFilter, dataSource,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { setRealInputTokens(d ? d.inputTokens : null); setEstimatingTokens(false); })
        .catch(() => { setRealInputTokens(null); setEstimatingTokens(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [dataSource, estConvCount, dateRange.from, dateRange.to, typeFilter, selectedManagers, selectedServices, selectedKinds]);

  const fallbackEstimate = dataSource === "transcripts"
    ? matchedConvs.reduce((sum, c) => sum + (c.transcript ? Math.ceil(c.transcript.length / CHARS_PER_TOKEN) : TOKENS_PER_CALL_FALLBACK), 0)
    : estConvCount * TOKENS_PER_RESULT_LINE;
  const estTokens = Math.round((realInputTokens ?? fallbackEstimate) + SYSTEM_PROMPT_TOKENS);

  return (
    <div>
      <Header title="Інсайти" subtitle="AI-аналітика по транскрипціях розмов" />

      <div className="p-6 space-y-6">

        {/* ── Query card ── */}
        {!canCreate && (
          <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-primary/50" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Створення нових інсайтів обмежено
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Кожен новий запит викликає платний AI-аналіз. Створювати інсайти можуть лише власник або адміністратор. Ти можеш переглядати всі вже створені звіти нижче.
              </p>
            </div>
          </div>
        )}
        {canCreate && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent-strong" />
            </div>
            <h2 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Нова аналітика
            </h2>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Питання до AI</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder="Наприклад: Яке заперечення клієнти говорили найчастіше на онлайн-зустрічах менеджерів за останній місяць?"
              className="w-full text-sm border border-border rounded-xl px-4 py-3 resize-none
                focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40
                placeholder:text-muted-foreground/50 leading-relaxed bg-card text-foreground"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            />
          </div>

          {/* Filters */}
          <div className="space-y-3 pt-1">
            {/* Data source toggle — own row, has a helper line below so keep it separate */}
            <div>
              <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 w-fit">
                {([
                  ["results",     "Результати аналізу", Database],
                  ["transcripts", "Сирі транскрипції",  ScrollText],
                ] as const).map(([val, label, Icon]) => (
                  <button key={val} onClick={() => setDataSource(val)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors font-medium",
                      dataSource === val ? "bg-accent text-white font-bold shadow-sm" : "text-muted-foreground hover:text-primary"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <Icon className="w-3 h-3" />{label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground px-1 mt-1" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                {dataSource === "results"
                  ? "Готовий AI-аналіз кожної розмови (бал, висновок, сильні/слабкі сторони) — швидко і дешево"
                  : "Повний текст розмов — глибший аналіз, більше токенів"}
              </p>
            </div>

            {/* Period comparison toggle */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none w-fit"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              <input type="checkbox" checked={comparePrevious} onChange={e => setComparePrevious(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary" />
              Порівняти з попереднім періодом такої ж довжини
            </label>

            {/* Type / date — own row */}
            <div className="flex items-center gap-3 flex-wrap">
            {/* Type filter */}
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
              {([["all","Всі"], ["call","Дзвінки"], ["meeting","Зустрічі"], ["chat","Чати"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setTypeFilter(val)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors font-medium",
                    typeFilter === val ? "bg-accent text-white font-bold shadow-sm" : "text-muted-foreground hover:text-primary"
                  )}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {val === "call" && <Phone className="w-3 h-3" />}
                  {val === "meeting" && <Video className="w-3 h-3" />}
                  {val === "chat" && <Send className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>

            <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            {/* Команда / Послуги / Типи розмов — own row, in that order */}
            <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <Filter className="w-3.5 h-3.5" /> Фільтри:
            </div>

            <div className="relative" ref={managersRef}>
              <button onClick={() => setManagersOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors bg-card w-56 shrink-0",
                  selectedManagers.length > 0
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">{selectedManagerNames}</span>
                {selectedManagers.length > 0 && (
                  <span className="bg-primary text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {selectedManagers.length}
                  </span>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", managersOpen && "rotate-180")} />
              </button>

              {managersOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-56 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Команда</p>
                  <button onClick={() => setSelectedManagers([])}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                      selectedManagers.length === 0 ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                    style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selectedManagers.length === 0 ? "bg-primary border-primary" : "border-border")}>
                      {selectedManagers.length === 0 && <BrandCheck className="w-3 h-3 text-white" />}
                    </div>
                    Всі менеджери
                  </button>
                  <div className="mx-3 my-1 h-px bg-border" />
                  {realManagers.map(m => {
                    const sel = selectedManagers.includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleManager(m.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                          sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          sel ? "bg-primary border-primary" : "border-border")}>
                          {sel && <BrandCheck className="w-3 h-3 text-white" />}
                        </div>
                        <ManagerAvatar name={m.name} avatarUrl={m.avatar_url} className="w-6 h-6 rounded-md text-[10px] shrink-0" />
                        {m.name}
                      </button>
                    );
                  })}
                  {selectedManagers.length > 0 && (
                    <button onClick={() => setSelectedManagers([])}
                      className="w-full text-center text-xs text-muted-foreground hover:text-red-500 py-2 border-t border-border mt-1 transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Скинути вибір
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="relative" ref={servicesRef}>
              <button onClick={() => setServicesOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors bg-card w-48 shrink-0",
                  selectedServices.length > 0
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <TableIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">{selectedServices.length === 0 ? "Всі послуги" : selectedServices.join(", ")}</span>
                {selectedServices.length > 0 && (
                  <span className="bg-primary text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {selectedServices.length}
                  </span>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", servicesOpen && "rotate-180")} />
              </button>

              {servicesOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-48 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Послуги</p>
                  <button onClick={() => setSelectedServices([])}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                      selectedServices.length === 0 ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                    style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selectedServices.length === 0 ? "bg-primary border-primary" : "border-border")}>
                      {selectedServices.length === 0 && <BrandCheck className="w-3 h-3 text-white" />}
                    </div>
                    Всі послуги
                  </button>
                  <div className="mx-3 my-1 h-px bg-border" />
                  {SERVICES.map(svc => {
                    const sel = selectedServices.includes(svc);
                    return (
                      <button key={svc} onClick={() => toggleService(svc)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                          sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          sel ? "bg-primary border-primary" : "border-border")}>
                          {sel && <BrandCheck className="w-3 h-3 text-white" />}
                        </div>
                        {svc}
                      </button>
                    );
                  })}
                  {selectedServices.length > 0 && (
                    <button onClick={() => setSelectedServices([])}
                      className="w-full text-center text-xs text-muted-foreground hover:text-red-500 py-2 border-t border-border mt-1 transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Скинути вибір
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="relative" ref={kindsRef}>
              <button onClick={() => setKindsOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors bg-card w-48 shrink-0",
                  selectedKinds.length > 0
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <ScrollText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">{selectedKinds.length === 0 ? "Всі типи розмов" : selectedKinds.join(", ")}</span>
                {selectedKinds.length > 0 && (
                  <span className="bg-primary text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {selectedKinds.length}
                  </span>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", kindsOpen && "rotate-180")} />
              </button>

              {kindsOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-56 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип розмови</p>
                  <button onClick={() => setSelectedKinds([])}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                      selectedKinds.length === 0 ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                    style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selectedKinds.length === 0 ? "bg-primary border-primary" : "border-border")}>
                      {selectedKinds.length === 0 && <BrandCheck className="w-3 h-3 text-white" />}
                    </div>
                    Всі типи розмов
                  </button>
                  <div className="mx-3 my-1 h-px bg-border" />
                  {FILTERABLE_CONVERSATION_KINDS.map(kind => {
                    const sel = selectedKinds.includes(kind);
                    return (
                      <button key={kind} onClick={() => toggleKind(kind)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                          sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          sel ? "bg-primary border-primary" : "border-border")}>
                          {sel && <BrandCheck className="w-3 h-3 text-white" />}
                        </div>
                        {kind}
                      </button>
                    );
                  })}
                  {selectedKinds.length > 0 && (
                    <button onClick={() => setSelectedKinds([])}
                      className="w-full text-center text-xs text-muted-foreground hover:text-red-500 py-2 border-t border-border mt-1 transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Скинути вибір
                    </button>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleRun} disabled={!question.trim() || loading || estTokens > CONTEXT_LIMIT}
              className={cn(
                "ml-auto flex items-center gap-2 px-5 py-2.5 text-sm font-black rounded-xl transition-all shadow-sm shrink-0",
                question.trim() && !loading && estTokens <= CONTEXT_LIMIT
                  ? "bg-primary text-white hover:bg-primary-hover active:scale-[0.98]"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {loading
                ? <><Clock className="w-4 h-4 animate-spin" /> Аналізую…</>
                : <><Play className="w-4 h-4" /> Запустити аналіз</>}
            </button>
            </div>
          </div>

          {/* Token meter */}
          <TokenMeter convCount={estConvCount} tokens={estTokens} type={typeFilter} estimating={estimatingTokens} />
        </div>
        )}

        {/* ── Loading ── */}
        {canCreate && loading && (
          <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="w-full max-w-md space-y-3">
              <div className="flex justify-between text-xs" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <span className="text-primary font-semibold">{progressLabel}</span>
                <span className="font-black text-primary">{progress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              AI проходить по транскрипціях і формує звіт — зазвичай займає 15–60 секунд
            </p>
          </div>
        )}

        {/* ── New report result ── */}
        {report && !loading && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Результат аналізу
              </h3>
            </div>
            <ReportView report={report} onClose={() => setReport(null)} allManagers={allManagers} canEdit={canCreate} />
          </div>
        )}

        {/* ── API Error ── */}
        {apiError && !loading && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Помилка аналізу</p>
              <p className="text-sm text-red-600 dark:text-red-400" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{apiError}</p>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!report && !loading && !apiError && history.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/6 flex items-center justify-center">
              <History className="w-6 h-6 text-primary/40" />
            </div>
            <p className="text-sm font-bold text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {canCreate ? "Введи питання та натисни «Запустити аналіз»" : "Звітів ще немає"}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-sm leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              {canCreate
                ? "AI проаналізує розмови за вибраний період і сформує структурований звіт з висновками та рекомендаціями."
                : "Тут з'являться інсайти, які створить власник або адміністратор."}
            </p>
          </div>
        )}

        {/* ── History ── */}
        {!report && !loading && history.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-foreground" />
                <h3 className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Історія аналізів
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">{history.length} звітів</span>
            </div>
            <div className="space-y-3">
              {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((item: any) => {
                const itemNumber = historyNumbers.get(item.id) ?? "?";
                return (
                  <HistoryCard key={item.id} item={item} itemNumber={itemNumber} onTogglePin={togglePin} onDelete={deleteInsight} allManagers={allManagers} canEdit={canCreate} />
                );
              })}
            </div>
            {/* History pagination */}
            {Math.ceil(history.length / HISTORY_PAGE_SIZE) > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>Показано {Math.min((historyPage - 1) * HISTORY_PAGE_SIZE + 1, history.length)}–{Math.min(historyPage * HISTORY_PAGE_SIZE, history.length)} з {history.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                    className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-primary hover:text-white hover:border-primary transition-colors"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>←</button>
                  {Array.from({ length: Math.ceil(history.length / HISTORY_PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setHistoryPage(p)}
                      className={cn("w-8 h-8 rounded-lg border text-xs font-semibold transition-colors",
                        historyPage === p ? "bg-primary text-white border-primary" : "border-border hover:bg-primary/8")}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{p}</button>
                  ))}
                  <button onClick={() => setHistoryPage(p => Math.min(Math.ceil(history.length / HISTORY_PAGE_SIZE), p + 1))} disabled={historyPage === Math.ceil(history.length / HISTORY_PAGE_SIZE)}
                    className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-primary hover:text-white hover:border-primary transition-colors"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>→</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
