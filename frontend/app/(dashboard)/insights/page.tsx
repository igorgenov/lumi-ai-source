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

import {
  Objection, ManagerRow, QuoteRow, StatKpi, TableData, ManagerStat, ComputedStats, Block,
  CHART_COLORS, ROW_TYPE_STYLE, ROW_TYPE_LABEL, KIND_META, sentimentTone, TONE_CARD_CLASS,
  findingTone, FINDING_TONE_CARD_CLASS, TONE_HEADING_CLASS, TREND_ARROW, TREND_COLOR,
  splitTaggedItems, splitListItems, FINDING_NUMBER_SOURCE, FINDING_NUMBER_MATCH,
  extractNameTokens, escapeRegExp, FindingText, stripLeadingNumber, toChartObjections,
  HBarChart, TableCard, BlockRenderer, QueryBlock, FilterChip, DeltaBadge, ComputedStatsCard,
  renderBlocksHtml, exportInsightPDF,
} from "./shared";

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
