"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";
import { BrandArrowRight, BrandCheck } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { cn, scoreColor } from "@/lib/utils";
import { useManagers } from "@/hooks/useManagers";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ArrowLeft, Download, Trash2, ScrollText, Database, ExternalLink,
  Lightbulb, AlertTriangle,
} from "lucide-react";
import {
  BlockRenderer, TableCard, ComputedStatsCard, FilterChip, QueryBlock, HBarChart,
  FindingText, splitListItems, stripLeadingNumber, extractNameTokens, toChartObjections,
  exportInsightPDF, ComputedStats, TableData, DeltaBadge, findingTone, FINDING_TONE_CARD_CLASS,
} from "../page";

// A single saved insight, viewed on its own page instead of expanding inline in the
// history list — a full AI report (multiple blocks, tables, quotes) needs real room to
// read, and an accordion pushing the whole list around every time you open one made
// the list itself awkward to scroll through.
export default function InsightDetailPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const id = params.id as string;

  const { data: session } = useSession();
  const role = useEffectiveRole();
  const canEdit = role === "owner" || role === "admin";

  const { managers: allManagers } = useManagers();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Same "stable numbering by creation order" logic as the /insights list page (see
  // historyNumbers there) — the number isn't stored anywhere, it's derived from position
  // in the full history, so this page has to fetch that same list to reproduce it.
  const [itemNumber, setItemNumber] = useState<number | string>("?");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/insights/${id}`)
      .then(async r => {
        if (!r.ok) { if (!cancelled) setNotFound(true); return; }
        const { insight } = await r.json();
        if (!cancelled) setItem(insight);
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/insights")
      .then(r => r.json())
      .then(data => {
        if (cancelled || !Array.isArray(data.insights)) return;
        const byDate = [...data.insights].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const idx = byDate.findIndex(i => i.id === id);
        if (idx >= 0) setItemNumber(idx + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  const managerIds: string[] = Array.isArray(item?.manager_ids) ? item.manager_ids : [];
  const managerNames = useMemo(
    () => managerIds.map(mid => allManagers.find(m => m.id === mid)?.name ?? mid),
    [managerIds.join("|"), allManagers.length]
  );
  const managersLabel = managerIds.length === 0 ? "Всі менеджери" : managerNames.join(", ");
  const findingNameTokens = useMemo(() => extractNameTokens(managerNames), [managerNames.join("|")]);
  // Chips (right column) only show a *real* filter — "Усі послуги"/"Усі типи розмов" would
  // just repeat "no filter was applied" as if it were information. managersLabel above stays
  // as a plain fact in the left rail's key-facts list, where "Всі менеджери" is a real answer
  // to "менеджер:", not a chip competing with actually-set filters.
  const servicesLabel = Array.isArray(item?.services) && item.services.length > 0 ? item.services.join(", ") : null;
  const kindsLabel = Array.isArray(item?.kinds) && item.kinds.length > 0 ? item.kinds.join(", ") : null;

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: "Видалити цей звіт?",
      description: `«${item.title || item.question}» — дію буде видно в Журналі змін, але сам звіт відновити не можна.`,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/insights", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("delete failed");
      router.push("/insights");
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="Інсайт" subtitle="Завантаження…" />
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div>
        <Header title="Інсайт не знайдено" subtitle="" />
        <div className="p-6">
          <Link href="/insights" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Назад до інсайтів
          </Link>
          <p className="mt-8 text-sm text-muted-foreground text-center">Цей звіт не знайдено — можливо, його вже видалили.</p>
        </div>
      </div>
    );
  }

  const date = new Date(item.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const typeLabel = item.type === "call" ? "Дзвінки" : item.type === "meeting" ? "Зустрічі" : null;

  const score = item.computed_stats?.current?.overallAvgScore as number | null | undefined;
  const prevScore = item.computed_stats?.previous?.overallAvgScore as number | null | undefined;
  const singleManagerId = managerIds.length === 1 ? managerIds[0] : null;

  return (
    <div>
      <Header title={item.title || "Інсайт"} subtitle={date} />

      <div className="p-6 space-y-4 max-w-[1200px]">
        <div className="flex items-center justify-between">
          <Link href="/insights" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Назад до інсайтів
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportInsightPDF({ ...item, managersLabel, servicesLabel, kindsLabel }, itemNumber)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg
                text-muted-foreground hover:text-primary hover:border-primary/30 bg-card transition-colors"
              style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            {canEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 dark:text-red-400 hover:border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:bg-red-500/10 bg-card transition-colors disabled:opacity-50"
                title="Видалити звіт">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-lg font-black text-primary leading-snug" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          {item.title || item.question}
        </p>

        <div className="flex gap-4 items-start">
          {/* Sticky left rail — the "hard facts" that stay visible while the narrative on the
              right scrolls: score, who/what/when, and the one action this page exists for. */}
          <aside className="w-[280px] shrink-0 sticky top-6 bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary text-white text-sm font-black flex items-center justify-center shrink-0"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{itemNumber}</span>
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

            {score != null && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Бал</p>
                <p className={cn("text-4xl font-black leading-none mt-1", scoreColor(score))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {score}<span className="text-sm text-muted-foreground font-semibold">/100</span>
                </p>
                {prevScore != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <DeltaBadge delta={score - prevScore} /> vs {item.computed_stats?.previousRangeLabel ?? "попередній період"}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5 text-xs border-t border-border pt-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Менеджер</span>
                <span className="font-semibold text-foreground text-right">{managersLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Розмов</span>
                <span className="font-semibold text-foreground">{item.analyzed_count}</span>
              </div>
              {item.date_from && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Період</span>
                  <span className="font-semibold text-foreground text-right">{item.date_from} — {item.date_to}</span>
                </div>
              )}
              {typeLabel && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Тип</span>
                  <span className="font-semibold text-foreground">{typeLabel}</span>
                </div>
              )}
              {typeof item.cost_usd === "number" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Вартість аналізу</span>
                  <span className="font-semibold text-primary">${item.cost_usd.toFixed(2)}</span>
                </div>
              )}
            </div>

            {singleManagerId && (
              <div className="space-y-2 border-t border-border pt-3">
                <Link href={`/coaching/plans?manager=${singleManagerId}`}
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  <Lightbulb className="w-3.5 h-3.5" /> Створити план коучингу
                </Link>
                <Link href={`/conversations?manager=${singleManagerId}`}
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-border text-foreground text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors">
                  Усі розмови {managerNames[0]} <BrandArrowRight className="w-2.5 h-2.5" />
                </Link>
              </div>
            )}
          </aside>

          {/* Narrative column — the AI's own read of the data, top to bottom. */}
          <div className="flex-1 min-w-0 space-y-4">
            {(servicesLabel || kindsLabel) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {servicesLabel && <FilterChip label="Послуги" value={servicesLabel} color="blue" />}
                {kindsLabel && <FilterChip label="Тип розмови" value={kindsLabel} color="amber" />}
              </div>
            )}

            {item.title && <QueryBlock question={item.question} />}

            {item.summary && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
              </div>
            )}

            {splitListItems(item.key_findings).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                <p className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ключові знахідки</p>
                {splitListItems(item.key_findings).map((f: string, i: number) => {
                  const tone = findingTone(f);
                  return (
                    <div key={i} className={cn("flex items-start gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2", FINDING_TONE_CARD_CLASS[tone])}>
                      {tone === "negative" && <BrandArrowRight className="w-3 h-3 text-red-500 mt-1 shrink-0 rotate-90" />}
                      {tone === "warning" && <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 mt-1 shrink-0" />}
                      {tone === "positive" && <BrandCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />}
                      {tone === "neutral" && <BrandArrowRight className="w-3 h-3 text-accent mt-1 shrink-0" />}
                      <span><FindingText text={f} nameTokens={findingNameTokens} /></span>
                    </div>
                  );
                })}
              </div>
            )}

            {Array.isArray(item.blocks) && item.blocks.length > 0 && (
              <BlockRenderer blocks={item.blocks} />
            )}

            {/* Older saved reports (before the block model) still render via their flat fields */}
            {Array.isArray(item.chart_data) && item.chart_data.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs font-bold text-foreground mb-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Розподіл за частотою:</p>
                <HBarChart data={toChartObjections(item.chart_data)!} />
              </div>
            )}

            {item.table_data && (item.table_data as TableData).headers?.length > 0 && (item.table_data as TableData).rows?.length > 0 && (
              <TableCard table={item.table_data} />
            )}

            {item.computed_stats?.current && (
              <ComputedStatsCard
                stats={item.computed_stats.current as ComputedStats}
                previous={item.computed_stats.previous}
                previousLabel={item.computed_stats.previousRangeLabel}
                hideOverall
              />
            )}

            {Array.isArray(item.by_manager) && item.by_manager.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs font-bold text-foreground mb-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>По менеджерах:</p>
                <div className="space-y-2">
                  {item.by_manager.map((m: { name: string; insight: string }, i: number) => {
                    const manager = allManagers.find(am => am.name === m.name);
                    return (
                      <div key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span>
                          <span className="font-bold text-foreground">{m.name}:</span>{" "}
                          <span className="text-muted-foreground">{m.insight}</span>
                        </span>
                        {manager && (
                          <Link href={`/coaching/plans?manager=${manager.id}`}
                            className="text-[11px] font-semibold text-primary hover:underline shrink-0 whitespace-nowrap flex items-center gap-1">
                            План коучингу <BrandArrowRight className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Array.isArray(item.quotes) && item.quotes.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs font-bold text-foreground mb-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Приклади з транскрипцій:</p>
                <div className="space-y-2">
                  {item.quotes.map((q: { manager: string; text: string; context: string; conversationId?: string }, i: number) => (
                    <div key={i} className="text-xs bg-secondary/20 border border-border rounded-lg p-2.5">
                      <p className="font-bold text-foreground mb-1">{q.manager}{q.context && ` · ${q.context}`}</p>
                      <p className="text-muted-foreground italic">«{q.text}»</p>
                      {q.conversationId && (
                        <Link href={`/conversations/${q.conversationId}`}
                          className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-primary underline hover:text-primary-hover">
                          <ExternalLink className="w-3 h-3" /> Переглянути розмову
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {splitListItems(item.recommendations).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs font-bold text-foreground mb-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Рекомендації:</p>
                <div className="space-y-1">
                  {splitListItems(item.recommendations).map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <RankBadge rank={i + 1} className="w-5 h-5 mt-0.5" />
                      {stripLeadingNumber(r)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
