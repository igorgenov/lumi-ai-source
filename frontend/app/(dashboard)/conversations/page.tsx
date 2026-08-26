"use client";
import { BrandCheck, BrandArrowRight } from "@/components/icons/brand-icons";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { formatDate, formatDuration, scoreColor, scoreBarColor, cn, parseServices, countsTowardAiScore, stripAgencyPrefix, FILTERABLE_CONVERSATION_KINDS, KIND_COLORS, SCORE_ZONES, scoreZone } from "@/lib/utils";
import { useConversations } from "@/hooks/useConversations";
import { InfoHint as Hint } from "@/components/ui/info-hint";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useManagers } from "@/hooks/useManagers";
import { Phone, Video, Send, Filter, Download, MessageSquare, Star, TrendingUp, Clock, Search, X, Users, ChevronDown, Plus, Loader2, History } from "lucide-react";
import Link from "next/link";
import { DateRangePicker, DateRange, currentMonthRange } from "@/components/ui/date-range-picker";
import { DateTimePicker } from "@/components/ui/date-picker";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useEffectiveRole } from "@/components/providers/view-as-provider";

// Same 3-zone scale as the Dashboard's "Розподіл по зонах" widget (and scoreColor/
// scoreBarColor in lib/utils) — keep boundaries/labels identical everywhere a score
// gets bucketed, and use these exact values as the ?score= link so Dashboard → Розмови
// deep links work.
const SCORE_BUCKETS = SCORE_ZONES.map(z => ({
  value: z.value, label: `${z.label} (${z.range})`, min: z.min, max: z.max, dot: z.bar,
}));

// ── Manager picker (single-select) — same visual language as the "Всі менеджери"
// filter dropdown above, just without the "all" option and closes on pick.
function ManagerPicker({ managers, value, onChange }: {
  managers: { id: string; name: string; avatar_url?: string | null }[]; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedName = managers.find(m => m.id === value)?.name;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors bg-card text-left",
          open || value ? "border-primary/40" : "border-border hover:border-primary/30"
        )}>
        <Users className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate flex-1", value ? "text-foreground" : "text-muted-foreground")}>
          {selectedName ?? "— не вказано —"}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-30 w-full py-1.5 max-h-64 overflow-y-auto">
          <button type="button" onClick={() => { onChange(""); setOpen(false); }}
            className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
              !value ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}>
            <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
              !value ? "bg-primary border-primary" : "border-border")}>
              {!value && <BrandCheck className="w-3 h-3 text-white" />}
            </div>
            — не вказано —
          </button>
          <div className="mx-3 my-1 h-px bg-border" />
          {managers.map(m => {
            const sel = value === m.id;
            return (
              <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                  sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}>
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  sel ? "bg-primary border-primary" : "border-border")}>
                  {sel && <BrandCheck className="w-3 h-3 text-white" />}
                </div>
                <ManagerAvatar name={m.name} avatarUrl={m.avatar_url} className="w-6 h-6 rounded-md text-[10px] shrink-0" />
                {m.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Manual entry modal ─────────────────────────────────────────────────────────
function ManualEntryModal({ managers, onClose }: { managers: { id: string; name: string; avatar_url?: string | null }[]; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [type, setType] = useState<"call" | "meeting" | "chat">("call");
  const [managerId, setManagerId] = useState("");
  const [clientName, setClientName] = useState("");
  // toISOString() would give UTC, not local time — a datetime-local input needs
  // local wall-clock components or it defaults 2-3 hours behind for Kyiv/Sofia.
  const [date, setDate] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [transcript, setTranscript] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [vttUrl, setVttUrl] = useState("");
  const [chatUrl, setChatUrl] = useState("");
  const [fetchingVtt, setFetchingVtt] = useState(false);
  const [vttError, setVttError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useDriveLink = type === "meeting" && driveUrl.trim().length > 0;

  async function fetchVttTranscript() {
    if (!vttUrl.trim()) return;
    setFetchingVtt(true);
    setVttError(null);
    try {
      const res = await fetch("/api/conversations/fetch-vtt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: vttUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVttError(data.error ?? "Помилка отримання VTT");
        return;
      }
      setTranscript(data.transcript);
    } catch {
      setVttError("Мережева помилка");
    } finally {
      setFetchingVtt(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (type === "chat") {
        const res = await fetch("/api/conversations/manual-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: chatUrl.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Помилка обробки");
          setSubmitting(false);
          return;
        }
        router.push(`/conversations/${data.conversationId}`);
        return;
      }
      if (useDriveLink) {
        const res = await fetch("/api/conversations/manual-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: driveUrl.trim(), manager_id: managerId || null, client_name: clientName,
            date: new Date(date).toISOString(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409 && data.conversationId) {
            setSubmitting(false);
            const reanalyze = await confirm({
              title: "Ця зустріч уже є в системі",
              description: "Цей запис уже додано й проаналізовано раніше. Запустити аналіз ще раз? Це платна дія — знову викликає AI. Якщо ні, просто відкриємо наявну розмову.",
              confirmLabel: "Так, проаналізувати ще раз",
              cancelLabel: "Ні",
              danger: false,
            });
            if (reanalyze) {
              await fetch(`/api/conversations/${data.conversationId}/reanalyze`, { method: "POST" });
            }
            router.push(`/conversations/${data.conversationId}`);
            return;
          }
          setError(data.error ?? "Помилка обробки");
          setSubmitting(false);
          return;
        }
        router.push(`/conversations/${data.conversationId}`);
        return;
      }
      const res = await fetch("/api/conversations/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, manager_id: managerId || null, client_name: clientName,
          date: new Date(date).toISOString(), transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Помилка збереження");
        setSubmitting(false);
        return;
      }
      router.push(`/conversations/${data.conversationId}`);
    } catch {
      setError("Мережева помилка");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Додати розмову вручну</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground -mt-1">
            Для розмови, яку Ringostat чи Google Meet не надіслали автоматично, або щоб перевірити промт на конкретному прикладі — встав готовий текст, посилання на VTT-транскрипцію Ringostat (дзвінок), запис Google Drive (зустріч) чи задачу Planfix (чат) нижче.
          </p>

          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 w-fit">
            {([["call", "Дзвінок"], ["meeting", "Зустріч"], ["chat", "Чат"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setType(val); setDriveUrl(""); setVttUrl(""); setVttError(null); }}
                className={cn("px-3 py-1.5 text-xs rounded-md transition-colors font-medium",
                  type === val ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-primary")}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {label}
              </button>
            ))}
          </div>

          {type === "chat" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Посилання на задачу Planfix
              </label>
              <input value={chatUrl} onChange={e => setChatUrl(e.target.value)}
                placeholder="https://inweb.planfix.com/task/1234567"
                className="px-3 py-2 text-xs border border-border rounded-lg bg-card" />
              <p className="text-[11px] text-muted-foreground">
                Це має бути задача типу «Лог чата з телеграм» (проєкт «Чати з контрагентами у Telegram» в Planfix) — саме там зберігається сама переписка з клієнтом, а не задача самої угоди. Менеджера, клієнта, дату й текст переписки система візьме напряму з Planfix — нічого іншого вводити не треба. Аналіз запуститься одразу і займе кілька хвилин.
              </p>
            </div>
          )}

          {type !== "chat" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Менеджер</label>
              <ManagerPicker managers={managers} value={managerId} onChange={setManagerId} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Дата та час розмови</label>
              <DateTimePicker value={date} onChange={setDate} />
            </div>
          </div>
          )}

          {type !== "chat" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Клієнт</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Назва компанії або номер телефону"
              className="px-3 py-2 text-xs border border-border rounded-lg bg-card" />
          </div>
          )}

          {type === "meeting" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Посилання на запис Google Drive (необов'язково)
              </label>
              <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="px-3 py-2 text-xs border border-border rounded-lg bg-card" />
              <p className="text-[11px] text-muted-foreground">
                Якщо встав посилання — текст транскрипту не потрібен: ми самі завантажимо запис і розшифруємо його
                (займе кілька хвилин, розмова з'явиться зі статусом "аналізується"). Файл має бути доступний
                підключеному Google-акаунту, і для цього способу обов'язково потрібен обраний менеджер.
              </p>
            </div>
          )}

          {type === "call" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Посилання на VTT-транскрипцію Ringostat (необов'язково)
              </label>
              <div className="flex gap-2">
                <input value={vttUrl} onChange={e => setVttUrl(e.target.value)}
                  placeholder="https://app.ringostat.com/recordings/....vtt?token=..."
                  className="flex-1 px-3 py-2 text-xs border border-border rounded-lg bg-card" />
                <button type="button" onClick={fetchVttTranscript} disabled={fetchingVtt || !vttUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-40 transition-colors whitespace-nowrap"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {fetchingVtt && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {fetchingVtt ? "Завантажуємо…" : "Отримати текст"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Посилання має вести на .vtt-файл (готова транскрипція Ringostat), не на аудіозапис. Текст заповнить поле нижче — перевір і за потреби відредагуй перед збереженням.
              </p>
              {vttError && <p className="text-[11px] text-red-500">{vttError}</p>}
            </div>
          )}

          {type !== "chat" && !useDriveLink && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Текст транскрипту</label>
              <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={10}
                placeholder="Спікер A: ...&#10;Спікер B: ..."
                className="px-3 py-2 text-xs border border-border rounded-lg bg-card font-mono resize-y" />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">Скасувати</button>
            <button onClick={submit}
              disabled={submitting || (type === "chat" ? !chatUrl.trim() : !clientName.trim() || (useDriveLink ? !managerId : !transcript.trim()))}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-40"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {submitting ? "Аналізуємо…" : (useDriveLink ? "Додати та обробити у фоні" : "Додати та проаналізувати")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Highlight matching text ───────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/40 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Score bar cell ────────────────────────────────────────────────────────────
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

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  analyzed:      { label: "Проаналізовано", className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30" },
  pending:       { label: "Очікує",         className: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30" },
  failed:        { label: "Помилка",        className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30" },
  no_transcript: { label: "Немає запису",   className: "bg-muted text-muted-foreground border-border" },
};

const SERVICES = ["SEO", "GEO", "PPC", "Analytics", "ASO", "ASA", "Nonprofit", "Не цільова"];

// ─────────────────────────────────────────────────────────────────────────────

function fmtDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Parses a "yyyy-MM-dd" URL param back into a local Date at midnight, or null if absent/invalid.
function parseDateParam(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export default function ConversationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const from = parseDateParam(searchParams.get("from"));
    const to = parseDateParam(searchParams.get("to"));
    return from || to ? { from, to } : currentMonthRange();
  });
  const [typeFilter, setTypeFilter]       = useState<"all" | "call" | "meeting" | "chat">(() => {
    const t = searchParams.get("type");
    return t === "call" || t === "meeting" || t === "chat" ? t : "all";
  });
  const [managerDropOpen, setManagerDropOpen] = useState(false);
  const managerDropRef = useRef<HTMLDivElement>(null);
  const [serviceDropOpen, setServiceDropOpen] = useState(false);
  const serviceDropRef = useRef<HTMLDivElement>(null);
  const [kindDropOpen, setKindDropOpen] = useState(false);
  const kindDropRef = useRef<HTMLDivElement>(null);
  const [scoreDropOpen, setScoreDropOpen] = useState(false);
  const scoreDropRef = useRef<HTMLDivElement>(null);
  const [managerFilter, setManagerFilter] = useState(() => searchParams.get("manager") ?? "");
  const [serviceFilter, setServiceFilter] = useState(() => searchParams.get("service") ?? "");
  const [kindFilter, setKindFilter]       = useState(() => searchParams.get("kind") ?? "");
  const [scoreFilter, setScoreFilter]     = useState(() => searchParams.get("score") ?? "");
  const [problemsOnly, setProblemsOnly]   = useState(() => searchParams.get("problems") === "1");
  const [search, setSearch]               = useState(() => searchParams.get("q") ?? "");
  const [currentPage, setCurrentPage]     = useState(1);
  const PAGE_SIZE = 12;

  // Keep the URL in sync with every filter so navigating to a conversation and back (via
  // router.back() or the browser's own back button) restores the exact same filtered view,
  // instead of silently resetting to the defaults — the reset was the actual bug, not this sync.
  useEffect(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", fmtDateParam(dateRange.from));
    if (dateRange.to) params.set("to", fmtDateParam(dateRange.to));
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (managerFilter) params.set("manager", managerFilter);
    if (serviceFilter) params.set("service", serviceFilter);
    if (kindFilter) params.set("kind", kindFilter);
    if (scoreFilter) params.set("score", scoreFilter);
    if (problemsOnly) params.set("problems", "1");
    if (search) params.set("q", search);
    const qs = params.toString();
    router.replace(qs ? `/conversations?${qs}` : "/conversations", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, typeFilter, managerFilter, serviceFilter, kindFilter, scoreFilter, problemsOnly, search]);

  // Same 60-minute threshold as the "stuck analysis" notification (api/notifications/route.ts)
  // — a conversation counts as a "problem" if it failed outright, or has been sitting in
  // "analyzing" long enough that it's almost certainly stuck rather than just slow.
  const STUCK_THRESHOLD_MS = 60 * 60 * 1000;
  function isProblem(c: { status: string; created_at: string | null }): boolean {
    if (c.status === "failed") return true;
    if (c.status === "analyzing" && c.created_at) {
      return Date.now() - new Date(c.created_at).getTime() > STUCK_THRESHOLD_MS;
    }
    return false;
  }

  const { conversations: realConversations, loading } = useConversations();
  const { stats } = useDashboardStats();
  const { managers: allManagers } = useManagers();
  const realManagers = allManagers.filter(m => m.role === "pm");
  const hasRealData = !loading && realConversations.length > 0;

  // KPI — use real stats when available, fall back to mock
  const totalConv   = hasRealData ? realConversations.length : stats.totalConversations;
  const allScores   = realConversations.filter(c => countsTowardAiScore(c)).map(c => c.ai_analysis?.score).filter((s): s is number => typeof s === "number" && s > 0);
  const avgScore    = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : stats.avgTeamScore;
  const analyzed    = realConversations.filter(c => c.status === "analyzed").length;
  const pending     = realConversations.filter(c => c.status === "analyzing").length;
  const successRate = totalConv > 0 ? Math.round((analyzed / totalConv) * 100) : stats.analyzedPct;

  // Active filter count (excluding date range and type tabs)
  const activeFilters = [managerFilter, serviceFilter, kindFilter, scoreFilter].filter(Boolean).length + (problemsOnly ? 1 : 0);
  const problemsCount = realConversations.filter(isProblem).length;

  function clearFilters() {
    setManagerFilter("");
    setServiceFilter("");
    setKindFilter("");
    setScoreFilter("");
    setProblemsOnly(false);
    setSearch("");
    setCurrentPage(1);
  }

  // Filter conversations
  const filtered = useMemo(() => {
    if (hasRealData) {
      return realConversations.filter(c => {
        if (typeFilter !== "all" && c.type !== typeFilter) return false;
        if (managerFilter && c.manager_id !== managerFilter) return false;
        if (serviceFilter && !parseServices(c.service).includes(serviceFilter)) return false;
        if (kindFilter && (c as any).conversation_kind !== kindFilter) return false;
        if (problemsOnly && !isProblem(c)) return false;
        if (scoreFilter) {
          // Zones (green/yellow/red) are a calls/meetings-only concept — chats never
          // count toward the AI-score zones on the dashboard (see countsTowardAiScore),
          // so a zone filter must exclude them too, or clicking a dashboard zone count
          // (e.g. "Зелена — 3") lands on a list that also shows chats with a score in
          // that range, which were never part of that "3" to begin with (confirmed
          // 2026-08-14, after chats started getting real scores).
          if (!countsTowardAiScore(c)) return false;
          const s = c.ai_analysis?.score;
          // A conversation with no score at all (non-scored conversation_kind) can
          // never belong to any zone — previously this block only ran when a score
          // WAS present, so a null score silently skipped the filter entirely and
          // showed up in every zone (confirmed 2026-07-28).
          if (s == null) return false;
          const bucket = SCORE_BUCKETS.find(b => b.value === scoreFilter);
          if (bucket && (s < bucket.min || s > bucket.max)) return false;
        }
        if (dateRange.from || dateRange.to) {
          const d = new Date(c.date);
          if (dateRange.from && d < dateRange.from) return false;
          if (dateRange.to) {
            const to = new Date(dateRange.to);
            to.setHours(23, 59, 59, 999);
            if (d > to) return false;
          }
        }
        if (search) {
          const q = search.toLowerCase();
          if (!(c.client_name?.toLowerCase().includes(q)) &&
              !(c.manager?.name?.toLowerCase().includes(q))) return false;
        }
        return true;
      });
    }
    return [];
  }, [typeFilter, managerFilter, serviceFilter, kindFilter, problemsOnly, scoreFilter, search, dateRange, hasRealData, realConversations]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [typeFilter, managerFilter, serviceFilter, kindFilter, problemsOnly, scoreFilter, search, dateRange]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (managerDropRef.current && !managerDropRef.current.contains(e.target as Node)) setManagerDropOpen(false);
      if (serviceDropRef.current && !serviceDropRef.current.contains(e.target as Node)) setServiceDropOpen(false);
      if (kindDropRef.current && !kindDropRef.current.contains(e.target as Node)) setKindDropOpen(false);
      if (scoreDropRef.current && !scoreDropRef.current.contains(e.target as Node)) setScoreDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const [showManualModal, setShowManualModal] = useState(false);
  const role = useEffectiveRole();
  const canManageConversations = role === "owner" || role === "admin";

  return (
    <div>
      <Header title="Розмови" subtitle="Всі дзвінки менеджерів" actions={
        canManageConversations ? (
          <button onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Plus className="w-3.5 h-3.5" /> Додати вручну
          </button>
        ) : undefined
      } />
      {showManualModal && <ManualEntryModal managers={realManagers} onClose={() => setShowManualModal(false)} />}

      <div className="p-6 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total */}
          <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Розмов у системі
                <Hint text="Загальна кількість дзвінків і зустрічей за весь час — не залежить від фільтра дат, який впливає лише на список нижче." className="ml-1" />
              </p>
              <p className="text-3xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{totalConv}</p>
              <p className="text-xs text-muted-foreground font-medium mt-1">всього в системі</p>
            </div>
            <div className="p-2 rounded-lg bg-primary/8 text-primary shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>

          {/* Avg score */}
          <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Середній AI-бал
                <Hint text="Середній бал по розмовах типу «Брифування» та «Презентація КП» з реальною послугою (без 'Не цільова') — єдині типи з активними критеріями оцінки. Від 0 до 100." className="ml-1" />
              </p>
              <p className="text-3xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {allScores.length > 0 ? avgScore.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-muted-foreground font-medium mt-1">
                {allScores.length > 0 ? `по ${allScores.length} розмовах (брифування/КП)` : "ще немає аналізу"}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-accent/15 text-accent-strong shrink-0">
              <Star className="w-4 h-4" />
            </div>
          </div>

          {/* Success rate */}
          <div className="bg-card border border-primary/10 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Опрацьовано AI
                <Hint text="Відсоток розмов, що вже пройшли AI-аналіз, від загальної кількості за весь час." className="ml-1" />
              </p>
              <p className="text-3xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {successRate}%
              </p>
              <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden w-24">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(successRate / 70) * 100}%` }} />
              </div>
            </div>
            <div className="p-2 rounded-lg bg-primary/8 text-primary shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          {/* Pending */}
          <div className="bg-card border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Очікують аналізу
                <Hint text="Кількість розмов у черзі на AI-обробку. Зазвичай займає до 5 хвилин." className="ml-1" />
              </p>
              <p className="text-3xl font-black text-amber-600 dark:text-amber-400" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{pending}</p>
              <p className="text-xs text-muted-foreground font-medium mt-1">Аналіз ~5 хв</p>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          {/* Row 1: type tabs + search + date */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Type tabs */}
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
              {([["all","Всі"], ["call","Дзвінки"], ["meeting","Зустрічі"], ["chat","Чати"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setTypeFilter(val)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors font-medium",
                    typeFilter === val
                      ? "bg-accent text-white font-bold shadow-sm"
                      : "text-muted-foreground hover:text-primary"
                  )}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {val === "call" && <Phone className="w-3 h-3" />}
                  {val === "meeting" && <Video className="w-3 h-3" />}
                  {val === "chat" && <Send className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>

            {/* Problems-only toggle */}
            <button onClick={() => setProblemsOnly(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium",
                problemsOnly
                  ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold"
                  : "border-border text-muted-foreground hover:border-red-200 dark:border-red-500/30 hover:text-red-500 bg-card"
              )}
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
              title="Помилка, або в черзі довше години">
              ⚠ Проблемні
              {problemsCount > 0 && (
                <span className={cn("text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center",
                  problemsOnly ? "bg-red-500 text-white" : "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400")}>
                  {problemsCount}
                </span>
              )}
            </button>

            {/* Search */}
            <div className="relative">
              <Search className={cn(
                "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
                search ? "text-primary" : "text-muted-foreground"
              )} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук клієнта або менеджера…"
                className={cn(
                  "pl-8 pr-8 py-2 text-xs border rounded-lg bg-card w-64 transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60",
                  search
                    ? "border-primary/40 ring-2 ring-primary/10"
                    : "border-border hover:border-primary/30"
                )}
                style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
              />
              {search ? (
                <button onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
              {/* Live result count to the right of the input — placing it below would
                  get covered by the filters row directly underneath. */}
              {search && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 text-[10px] font-semibold whitespace-nowrap"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {filtered.length > 0
                    ? <span className="text-primary">Знайдено: {filtered.length}</span>
                    : <span className="text-red-500">Нічого не знайдено</span>
                  }
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} align="right" />
            </div>
          </div>

          {/* Row 2: dropdowns + active filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <Filter className="w-3.5 h-3.5" /> Фільтри:
            </div>

            {/* Manager */}
            <div className="relative" ref={managerDropRef}>
              <button
                onClick={() => setManagerDropOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors bg-card",
                  managerFilter
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>{managerFilter ? (realManagers.find(m => m.id === managerFilter)?.name ?? "Всі менеджери") : "Всі менеджери"}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", managerDropOpen && "rotate-180")} />
              </button>

              {managerDropOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-56 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Команда</p>
                  <button
                    onClick={() => { setManagerFilter(""); setManagerDropOpen(false); }}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                      !managerFilter ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                    style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      !managerFilter ? "bg-primary border-primary" : "border-border")}>
                      {!managerFilter && <BrandCheck className="w-3 h-3 text-white" />}
                    </div>
                    Всі менеджери
                  </button>
                  <div className="mx-3 my-1 h-px bg-border" />
                  {realManagers.map(m => {
                    const sel = managerFilter === m.id;
                    return (
                      <button key={m.id}
                        onClick={() => { setManagerFilter(sel ? "" : m.id); setManagerDropOpen(false); }}
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
                </div>
              )}
            </div>

            {/* Service */}
            <div className="relative" ref={serviceDropRef}>
              <button
                onClick={() => setServiceDropOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors bg-card",
                  serviceFilter
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <span>{serviceFilter || "Всі послуги"}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", serviceDropOpen && "rotate-180")} />
              </button>
              {serviceDropOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-44 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Послуга</p>
                  {["", ...SERVICES].map(s => {
                    const sel = serviceFilter === s;
                    return (
                      <button key={s || "__all__"}
                        onClick={() => { setServiceFilter(s); setServiceDropOpen(false); }}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                          sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                          sel ? "bg-primary border-primary" : "border-border")}>
                          {sel && <BrandCheck className="w-3 h-3 text-white" />}
                        </div>
                        {s || "Всі послуги"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Kind */}
            <div className="relative" ref={kindDropRef}>
              <button
                onClick={() => setKindDropOpen(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors bg-card",
                  kindFilter
                    ? "border-primary/40 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                <span>{kindFilter || "Будь-який тип"}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", kindDropOpen && "rotate-180")} />
              </button>
              {kindDropOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-52 py-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип розмови</p>
                  {["", ...FILTERABLE_CONVERSATION_KINDS].map(k => {
                    const sel = kindFilter === k;
                    return (
                      <button key={k || "__all__"}
                        onClick={() => { setKindFilter(k); setKindDropOpen(false); }}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                          sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                          sel ? "bg-primary border-primary" : "border-border")}>
                          {sel && <BrandCheck className="w-3 h-3 text-white" />}
                        </div>
                        {k || "Будь-який тип"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Score */}
            {(() => {
              const SCORES = [{ value: "", label: "Будь-який бал", dot: undefined }, ...SCORE_BUCKETS];
              return (
                <div className="relative" ref={scoreDropRef}>
                  <button
                    onClick={() => setScoreDropOpen(v => !v)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors bg-card",
                      scoreFilter
                        ? "border-primary/40 text-primary font-bold"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                    <span>{SCORES.find(s => s.value === scoreFilter)?.label ?? "Будь-який бал"}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", scoreDropOpen && "rotate-180")} />
                  </button>
                  {scoreDropOpen && (
                    <div className="absolute left-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 w-52 py-1.5">
                      <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>AI Бал</p>
                      {SCORES.map(s => {
                        const sel = scoreFilter === s.value;
                        return (
                          <button key={s.value || "__all__"}
                            onClick={() => { setScoreFilter(s.value); setScoreDropOpen(false); }}
                            className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                              sel ? "bg-primary/6 text-primary font-semibold" : "text-foreground hover:bg-secondary/60")}
                            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                            <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                              sel ? "bg-primary border-primary" : "border-border")}>
                              {sel && <BrandCheck className="w-3 h-3 text-white" />}
                            </div>
                            {s.dot && <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />}
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Active filter badge + clear */}
            {(activeFilters > 0 || search) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                  bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:bg-red-500/15 transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <X className="w-3 h-3" />
                Скинути фільтри
                {activeFilters > 0 && (
                  <span className="ml-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                    {activeFilters + (search ? 1 : 0)}
                  </span>
                )}
              </button>
            )}

            {/* Result count */}
            <span className="ml-auto text-xs text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Знайдено: <span className="font-bold text-primary">{filtered.length}</span> з {totalConv}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Тип
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Клієнт
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Менеджер
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Послуга
                  <Hint text="Напрямок Inweb, що обговорювався в розмові: SEO, GEO, PPC тощо." className="ml-1" />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Тип розмови
                  <Hint text="Мета розмови (брифування, follow-up, скарга тощо) — окремо від того, яку послугу обговорювали." className="ml-1" />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Тривалість
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Дата
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  Статус
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  AI Бал
                  <Hint text="Оцінка якості розмови від 0 до 100 за алгоритмом Inweb AI: виявлення потреб, відпрацювання заперечень, закриття. Три зони: 🔴 0-54 (терміновий коучинг), 🟡 55-75 (прийнятно, є що підтягнути), 🟢 76-100 (сильний результат)." className="ml-1" />
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        Розмов не знайдено
                      </p>
                      <p className="text-xs text-muted-foreground/60">Спробуйте змінити фільтри або пошуковий запит</p>
                      <button onClick={clearFilters}
                        className="mt-2 text-xs text-primary font-semibold hover:underline"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        Скинути всі фільтри
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((conv: any) => {
                  const duration = conv.duration_seconds ?? 0;
                  const statusMeta = STATUS_LABEL[conv.status] ?? STATUS_LABEL["pending"];
                  const clientName = stripAgencyPrefix(conv.client_name) || "Невідомий";
                  const clientCompany = conv.client_company;
                  // client_company only reliably holds a real domain for chats (AI-extracted
                  // client_domain, see chats.py) — for calls/meetings it can hold other things
                  // (e.g. a service name), so only swap the primary line for chats, and only
                  // when it actually looks like a domain, not just any non-empty string.
                  const looksLikeDomain = typeof clientCompany === "string" && /\.[a-z]{2,}$/i.test(clientCompany.split("/")[0].trim()) && !clientCompany.includes(" ");
                  const showDomainFirst = conv.type === "chat" && looksLikeDomain;
                  const managerName = conv.manager?.name ?? "—";
                  const score = conv.ai_analysis?.score;

                  return (
                    <tr key={conv.id} className="hover:bg-secondary transition-colors group">
                      <td className="px-4 py-3.5">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">
                          {conv.type === "call" ? <Phone className="w-4 h-4" />
                            : conv.type === "chat" ? <Send className="w-4 h-4" />
                            : <Video className="w-4 h-4" />}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-foreground text-sm" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                          <Highlight text={showDomainFirst ? clientCompany : clientName} query={search} />
                        </p>
                        {showDomainFirst ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <Highlight text={clientName} query={search} />
                          </p>
                        ) : (
                          // For meetings, client_company holds the meeting topic/service
                          // (see backend/app/routers/meetings.py), not a real company name —
                          // showing it here just repeats what the "Тип розмови" column
                          // already says, so only chats (a genuine company/domain) get this line.
                          conv.type !== "meeting" && clientCompany && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <Highlight text={clientCompany} query={search} />
                            </p>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">
                        <Highlight text={managerName} query={search} />
                      </td>
                      <td className="px-4 py-3.5">
                        {conv.service && (() => {
                          const services = parseServices(conv.service);
                          return (
                            <div className="flex flex-wrap gap-1">
                              {services.map(svc => (
                                <span key={svc} className="text-xs font-bold px-2 py-0.5 rounded-md border border-border bg-secondary text-muted-foreground whitespace-nowrap"
                                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                                  {svc}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {conv.conversation_kind && (() => {
                            const kindColor = KIND_COLORS[conv.conversation_kind] ?? "#6b7280";
                            return (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md border whitespace-nowrap"
                                style={{ color: kindColor, backgroundColor: `${kindColor}14`, borderColor: `${kindColor}33`, fontFamily: "var(--font-unbounded), sans-serif" }}>
                                {conv.conversation_kind}
                              </span>
                            );
                          })()}
                          {!!conv.analysis_history_count && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-border text-muted-foreground whitespace-nowrap"
                              title="Цей чат переаналізується щотижня — стільки разів оцінка вже оновлювалась. Історію дивись у картці розмови."
                              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                              <History className="w-2.5 h-2.5" /> оновлено {conv.analysis_history_count}×
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">
                        {conv.type === "chat" ? "—" : formatDuration(duration)}
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
                            title="Цей тип розмови не оцінюється за критеріями Брифування/Презентації КП"
                            style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>
                            Без оцінки
                          </span>
                        ) : (
                          <span className="inline-block whitespace-nowrap text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md font-semibold"
                            style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>
                            В черзі
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link href={`/conversations/${conv.id}`}
                          className="text-muted-foreground group-hover:text-primary transition-colors">
                          <BrandArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            Показано {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} з {filtered.length} розмов
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold
                  disabled:opacity-40 disabled:cursor-not-allowed
                  hover:bg-primary hover:text-white hover:border-primary transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                ←
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={cn(
                        "w-8 h-8 rounded-lg border text-xs font-semibold transition-colors",
                        currentPage === p
                          ? "bg-primary text-white border-primary"
                          : "border-border hover:bg-primary/8 hover:border-primary/30"
                      )}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold
                  disabled:opacity-40 disabled:cursor-not-allowed
                  hover:bg-primary hover:text-white hover:border-primary transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
