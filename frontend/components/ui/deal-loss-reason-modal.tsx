"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { X, ExternalLink, MessageSquare } from "lucide-react";

export type DealLossReason = {
  reason: string;
  explanation: string;
  confidence: number;
  stated_vs_real?: string | null;
  has_csm_feedback: boolean;
  has_sm_feedback?: boolean;
  sources_used: number;
};

// Claude sometimes returns the reason as a lowercase sentence fragment ("угода зависла
// через...") — capitalize the first letter for display without touching the stored data.
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

interface Props {
  reason: DealLossReason;
  taskName: string | null;
  service: string | null;
  planfixTaskId: number;
  computedAt: string | null;
  smReasonCategory?: string | null;
  smReasonComment?: string | null;
  smWinReason?: string | null;
  smCompetitors?: string | null;
  contragent?: { id: string; name: string | null; domain: string | null } | null;
  onClose: () => void;
}

// Shared by both "Причини відмов"/"Причини вибору" review pages and the contragent's
// "Угоди" tab card — same detail view either way, so a fix/tweak here never drifts
// between places. smReasonCategory/Comment are loss-side (Planfix fields 1667/1669),
// smWinReason/Competitors are win-side (fields 2431/2441) — a deal only ever has one pair.
export function DealLossReasonModal({ reason: r, taskName, service, planfixTaskId, computedAt, smReasonCategory, smReasonComment, smWinReason, smCompetitors, contragent, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{contragent?.domain || contragent?.name || service || "Угода"}</p>
            <h3 className="text-sm font-bold text-foreground truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{taskName}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-3"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center text-sm font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {cap(r.reason)}
            </span>
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border",
              r.confidence >= 70 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
                : r.confidence >= 40 ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
                : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30")}>
              Впевненість {r.confidence}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{r.explanation}</p>
          {r.stated_vs_real && (
            <p className="text-xs text-muted-foreground mt-3 italic border-l-2 border-border pl-3">Відмінність від причини SM: {r.stated_vs_real}</p>
          )}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-secondary text-muted-foreground">
              <MessageSquare className="w-3 h-3" /> {r.sources_used} {r.sources_used === 1 ? "розмова" : "розмов"} використано
            </span>
            {r.has_csm_feedback && (
              <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-secondary text-muted-foreground">Є фідбек CSM</span>
            )}
            {r.has_sm_feedback && (
              <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-secondary text-muted-foreground">Є фідбек SM</span>
            )}
          </div>
          {computedAt && (
            <p className="text-[10px] text-muted-foreground/70 mt-3">Проаналізовано {fmtDate(computedAt)}</p>
          )}
          {(smReasonCategory || smReasonComment) && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Причина SM (з Planfix)</p>
              {smReasonCategory && (
                <p className="text-sm font-medium text-foreground">{smReasonCategory}</p>
              )}
              {smReasonComment && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{smReasonComment}</p>
              )}
            </div>
          )}
          {(smWinReason || smCompetitors) && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Відповідь SM (з Planfix)</p>
              {smWinReason && (
                <p className="text-sm font-medium text-foreground">{smWinReason}</p>
              )}
              {smCompetitors && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Розглядали також: {smCompetitors}</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            {contragent && (
              <Link href={`/contragents/${contragent.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Картка контрагента <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            <a href={`https://inweb.planfix.com/task/${planfixTaskId}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
              Відкрити угоду у Planfix <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
