"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";
import { BrandCheck, BrandClose, BrandArrowRight } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";

import { Header } from "@/components/layout/header";
import { formatDate, formatDuration, scoreColor, scoreBarColor, cn, parseServices, normalizeMood, stripAgencyPrefix, CONVERSATION_KINDS, scoreZone, conversionColor, conversionBarColor, generateSlug } from "@/lib/utils";
import {
  Phone, Video, Send, Clock, Calendar, User, ArrowLeft,
  ThumbsUp, ThumbsDown, Lightbulb, MessageSquare, BarChart3, RefreshCw, Tag, ExternalLink, ListFilter, Target, History, X,
  Play, Pause, Volume2, VolumeX, Copy,
} from "lucide-react";

const SERVICES = ["SEO", "GEO", "PPC", "Analytics", "ASO", "ASA", "Nonprofit", "Не цільова"];

const CRITERIA_LABELS: Record<string, string> = {
  greeting: "Привітання та представлення",
  needs_discovery: "Виявлення потреб",
  presentation: "Презентація рішення",
  objection_handling: "Робота із запереченнями",
  closing: "Закриття / наступний крок",
};

// insights.goal_achieved is independent of score/criteria — whether the call's own
// purpose was met, not how well individual steps were executed (see claude_analysis.py).
const GOAL_ACHIEVED_STYLE: Record<string, string> = {
  "досягнуто": "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "частково": "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "не досягнуто": "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
};

const PROMISE_KEEPING_STYLE: Record<string, string> = {
  "дотримався": "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "порушив": "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  "не обіцяв конкретних термінів": "bg-secondary text-muted-foreground",
};

// Chat-only insight fields (backend/app/services/chat_analysis.py) — never populated for
// calls/meetings, so every row here is naturally hidden on those conversation types.
function ChatInsightExtras({ insights }: { insights: any }) {
  if (!insights) return null;
  const hasParticipants = insights.client_participants_count != null;
  const hasDynamics = insights.client_response_trend || insights.client_message_length_trend || insights.last_message_sender || insights.client_tone_shift;
  const hasStall = insights.stall_reason || insights.stall_reason_type;
  const hasPromise = insights.promise_keeping;
  const hasEmotion = insights.client_emotional_signal;
  if (!hasParticipants && !hasDynamics && !hasStall && !hasPromise && !hasEmotion) return null;
  return (
    <>
      {hasParticipants && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Учасники з боку клієнта</p>
          <p className="text-xs text-foreground/80">{insights.client_participants_count}{insights.client_participants_names ? ` (${insights.client_participants_names})` : ""}</p>
        </div>
      )}
      {hasDynamics && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Динаміка клієнта</p>
          <div className="text-xs text-foreground/80 space-y-0.5">
            {insights.client_response_trend && <p>Швидкість відповіді: {insights.client_response_trend}</p>}
            {insights.client_message_length_trend && <p>Довжина повідомлень: {insights.client_message_length_trend}</p>}
            {insights.last_message_sender && <p>Останнє повідомлення написав: {insights.last_message_sender}</p>}
            {insights.client_tone_shift && <p>Зміна тону: {insights.client_tone_shift}</p>}
          </div>
        </div>
      )}
      {hasStall && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Причина затухання</p>
          <p className="text-xs text-foreground/80">
            {insights.stall_reason || (insights.stall_reason_type === "unknown" ? "Клієнт зник без пояснення" : "—")}
          </p>
          {insights.manager_recovery_attempt && <p className="text-xs text-muted-foreground mt-0.5">{insights.manager_recovery_attempt}</p>}
        </div>
      )}
      {hasPromise && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Дотримання обіцянок</p>
          <span className={cn("inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-0.5", PROMISE_KEEPING_STYLE[insights.promise_keeping] ?? "bg-secondary text-muted-foreground")}>
            {insights.promise_keeping}
          </span>
          {insights.promise_keeping_reasoning && <p className="text-xs text-muted-foreground">{insights.promise_keeping_reasoning}</p>}
        </div>
      )}
      {hasEmotion && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Емоційний сигнал клієнта</p>
          <p className="text-xs text-foreground/80">{insights.client_emotional_signal}</p>
        </div>
      )}
    </>
  );
}
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ConversationRow } from "@/hooks/useConversations";
import { InfoHint as Hint } from "@/components/ui/info-hint";
import { useTheme } from "@/components/theme-provider";

// Clients sometimes paste payment requisites straight into a Telegram chat — matches
// what managers actually request per Inweb's own договір/реквізити email templates:
// Ukrainian ФОП/ТОВ (IBAN, ЄДРПОУ/ІПН, bank МФО, older-format р/р without "UA" prefix)
// and international clients (generic IBAN for any country, VAT number). Best-effort
// pattern match, not exhaustive, same "best-effort enrichment" spirit as the rest of
// the pipeline. Blurred by default for everyone; only owner/admin/manager can click to
// reveal — a "viewer" role never can, same split used elsewhere for edit permissions.
const SENSITIVE_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b|(?:ЄДРПОУ|едрпоу|ІПН|іпн|МФО|мфо)[:\s]*\d{6,10}|(?:р\/р|Р\/Р|розрахунковий рахунок|Розрахунковий рахунок)[:\s]*\d{10,29}\b|\b(?:VAT|vat)[\s:]*[A-Z]{0,2}\d{6,12}\b/g;

function SensitiveText({ text, canReveal }: { text: string; canReveal: boolean }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const parts: { text: string; sensitive: boolean }[] = [];
  let lastIndex = 0;
  for (const m of Array.from(text.matchAll(SENSITIVE_PATTERN))) {
    if (m.index! > lastIndex) parts.push({ text: text.slice(lastIndex, m.index), sensitive: false });
    parts.push({ text: m[0], sensitive: true });
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), sensitive: false });
  if (!parts.some(p => p.sensitive)) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        !p.sensitive ? <span key={i}>{p.text}</span> : (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              if (!canReveal) return;
              setRevealed(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });
            }}
            title={canReveal ? (revealed.has(i) ? "Сховати" : "Натисни, щоб показати") : "Доступно лише менеджерам і адмінам"}
            className={cn(
              "rounded px-1 mx-0.5 transition-all select-none",
              revealed.has(i)
                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30"
                : cn("bg-secondary text-transparent [text-shadow:0_0_8px_rgba(21,28,67,0.6)]", canReveal ? "cursor-pointer hover:bg-secondary/70" : "cursor-not-allowed")
            )}
          >
            {p.text}
          </span>
        )
      )}
    </>
  );
}

// Wraps SensitiveText with AI-tagged moment highlighting (e.g. #Заперечення_Ціна) —
// an additional annotation on top of the analysis, independent of score/criteria (see
// claude_analysis.py "tagged_moments"). Matches each quote as an exact substring of the
// message text; recurses through remaining tags so more than one can land in one message.
function TaggedText({ text, canReveal, tags }: { text: string; canReveal: boolean; tags: { quote: string; tag: string }[] }) {
  let best: { quote: string; tag: string; index: number } | null = null;
  for (const t of tags) {
    if (!t.quote) continue;
    const idx = text.indexOf(t.quote);
    if (idx !== -1 && (!best || idx < best.index)) best = { ...t, index: idx };
  }
  if (!best) return <SensitiveText text={text} canReveal={canReveal} />;

  const before = text.slice(0, best.index);
  const matched = text.slice(best.index, best.index + best.quote.length);
  const after = text.slice(best.index + best.quote.length);
  const remainingTags = tags.filter(t => t !== best);
  // "#Заперечення_Ціна" -> "Заперечення ціна" — no "#"/underscores, this isn't a
  // clickable/searchable tag system (yet), just a label naming why it's highlighted.
  const label = best.tag.replace(/^#/, "").replace(/_/g, " ");

  return (
    <>
      {before && <SensitiveText text={before} canReveal={canReveal} />}
      <mark className="bg-accent/20 text-inherit rounded px-0.5">{matched}</mark>
      <span className="inline-block align-middle ml-1 mr-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-white whitespace-nowrap"
        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
        {label}
      </span>
      <TaggedText text={after} canReveal={canReveal} tags={remainingTags} />
    </>
  );
}

// ── Custom audio player ────────────────────────────────────────────────────────
// Replaces the plain browser <audio controls> with something that matches Lumi's
// own design (purple accent, Montserrat) — the native control looked/behaved
// differently across browsers and clashed visually with the rest of the card.
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [copied, setCopied] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  function setVol(v: number) {
    setVolume(v);
    const a = audioRef.current;
    if (!a) return;
    a.volume = v;
    a.muted = v === 0;
    setMuted(v === 0);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function seekToClientX(clientX: number) {
    const el = barRef.current, audio = audioRef.current;
    if (!el || !audio || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  }

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-muted px-4 py-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onTimeUpdate={e => { if (!scrubbing) setCurrent(e.currentTarget.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={() => { const a = audioRef.current; if (!a) return; playing ? a.pause() : a.play(); }}
          className="w-9 h-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            ref={barRef}
            className="relative h-2 rounded-full bg-border cursor-pointer group"
            onMouseDown={e => { setScrubbing(true); seekToClientX(e.clientX); }}
            onMouseMove={e => { if (scrubbing) seekToClientX(e.clientX); }}
            onMouseUp={() => setScrubbing(false)}
            onMouseLeave={() => scrubbing && setScrubbing(false)}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            <span>{fmtTime(current)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { const a = audioRef.current; if (!a) return; a.muted = !a.muted; setMuted(a.muted); }}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={e => setVol(Number(e.target.value))}
            className="w-16 accent-primary cursor-pointer"
          />
        </div>

        <button
          onClick={() => {
            const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            setSpeed(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/8 transition-colors tabular-nums"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
        >
          {speed}x
        </button>

        <button
          onClick={copyLink}
          title="Скопіювати посилання на цю розмову"
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? <BrandCheck className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function goBackToList(router: ReturnType<typeof useRouter>) {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.back();
  } else {
    router.push("/conversations");
  }
}

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme } = useTheme();
  const role = useEffectiveRole();
  const canRevealSensitive = role === "owner" || role === "admin" || role === "pm";
  const canEditCoaching = role === "owner" || role === "admin";
  const [conv, setConv] = useState<ConversationRow | null>(null);
  type HistoryEntry = { id: string; score: number | null; summary: string | null; client_mood: string | null; manager_mood: string | null; strengths: string[] | null; weaknesses: string[] | null; criteria: Record<string, number> | null; insights: Record<string, unknown> | null; analyzed_at: string };
  const [analysisHistory, setAnalysisHistory] = useState<HistoryEntry[]>([]);
  const [historyModalEntry, setHistoryModalEntry] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [editingService, setEditingService] = useState(false);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editingService) return;
    function handleClickOutside(e: MouseEvent) {
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target as Node)) {
        setEditingService(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingService]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [serviceSaved, setServiceSaved] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  useEffect(() => {
    if (conv) setSelectedServices(parseServices((conv as any).service));
  }, [conv]);

  const [editingKind, setEditingKind] = useState(false);
  const kindDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [kindSaved, setKindSaved] = useState(false);
  const [kindError, setKindError] = useState<string | null>(null);

  useEffect(() => {
    if (conv) setSelectedKind((conv as any).conversation_kind ?? null);
  }, [conv]);

  useEffect(() => {
    if (!editingKind) return;
    function handleClickOutside(e: MouseEvent) {
      if (kindDropdownRef.current && !kindDropdownRef.current.contains(e.target as Node)) {
        setEditingKind(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingKind]);

  async function saveKind(next: string | null) {
    if (!conv) return;
    setKindError(null);
    setKindSaved(false);
    setSelectedKind(next);
    setEditingKind(false);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/kind`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_kind: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKindError(data.error ?? "Помилка збереження");
        return;
      }
      setKindSaved(true);
      setTimeout(() => setKindSaved(false), 2000);
    } catch {
      setKindError("Мережева помилка");
    }
  }

  useEffect(() => {
    fetch(`/api/conversations/${params.id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(({ conversation, analysisHistory }) => { setConv(conversation ?? null); setAnalysisHistory(analysisHistory ?? []); })
      .catch(() => setConv(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  const [addingToCoaching, setAddingToCoaching] = useState(false);
  const [addedToCoaching, setAddedToCoaching] = useState(false);
  const [coachingError, setCoachingError] = useState<string | null>(null);

  async function addRecommendationsToCoaching() {
    if (!conv?.manager_id || !analysis?.recommendations?.length) return;
    setAddingToCoaching(true);
    setCoachingError(null);
    try {
      const clientLabel = stripAgencyPrefix(conv.client_name) || "клієнтом";
      const notes = `З аналізу розмови з ${clientLabel} (${formatDate(conv.date)}):\n` +
        analysis.recommendations.map((r: string) => `- ${r}`).join("\n");
      const res = await fetch("/api/coaching/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerId: conv.manager_id,
          date: new Date().toISOString().slice(0, 10),
          notes,
          homework: "",
          nextSession: null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCoachingError(data.error ?? "Помилка збереження");
        return;
      }
      setAddedToCoaching(true);
    } catch {
      setCoachingError("Мережева помилка");
    } finally {
      setAddingToCoaching(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="Розмова" subtitle="Завантаження…" />
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!conv) {
    return (
      <div>
        <Header title="Розмова не знайдена" subtitle="" />
        <div className="p-6">
          <button onClick={() => goBackToList(router)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Назад до списку
          </button>
          <p className="mt-8 text-sm text-muted-foreground text-center">Розмову не знайдено.</p>
        </div>
      </div>
    );
  }

  const analysis = conv.ai_analysis;
  const clientLabel = stripAgencyPrefix(conv.client_name) || "Невідомий";

  async function saveServices(next: string[]) {
    if (!conv) return;
    setServiceError(null);
    setServiceSaved(false);
    setSelectedServices(next);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/service`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: next.length ? next.join(",") : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServiceError(data.error ?? "Помилка збереження");
        return;
      }
      setServiceSaved(true);
      setTimeout(() => setServiceSaved(false), 2000);
    } catch {
      setServiceError("Мережева помилка");
    }
  }

  function toggleService(service: string) {
    // "Не цільова" is mutually exclusive with real services — picking it clears everything else.
    if (service === "Не цільова") {
      saveServices(selectedServices.includes(service) ? [] : ["Не цільова"]);
      return;
    }
    const withoutNonTarget = selectedServices.filter(s => s !== "Не цільова");
    const next = withoutNonTarget.includes(service)
      ? withoutNonTarget.filter(s => s !== service)
      : [...withoutNonTarget, service];
    saveServices(next);
  }

  async function handleReanalyze() {
    if (!conv) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRetryError(data.error ?? "Помилка повторного аналізу");
        return;
      }
      window.location.reload();
    } catch {
      setRetryError("Мережева помилка, спробуйте ще раз");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div>
      <Header
        title={clientLabel}
        subtitle={(conv as any).client_company ? `${(conv as any).client_company} · ${formatDate(conv.date)}` : formatDate(conv.date)}
      />

      <div className="p-6 space-y-4">
        <button onClick={() => goBackToList(router)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Назад до списку
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left */}
          <div className="lg:col-span-2 space-y-4">

            {/* Meta */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-secondary text-muted-foreground">
                    {conv.type === "call" ? <Phone className="w-5 h-5" />
                      : conv.type === "chat" ? <Send className="w-5 h-5" />
                      : <Video className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      {conv.type === "call" ? "Телефонний дзвінок" : conv.type === "chat" ? "Переписка в Telegram" : "Відеозустріч"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={cn(
                        "inline-block text-xs font-semibold px-2 py-0.5 rounded-full border",
                        conv.status === "analyzed"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
                          : conv.status === "analyzing"
                          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
                          : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30"
                      )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {conv.status === "analyzed" ? "Проаналізовано" : conv.status === "analyzing" ? "Аналізується…" : "Помилка"}
                      </span>
                      {conv.status !== "analyzing" && canEditCoaching && (
                        <button
                          onClick={handleReanalyze}
                          disabled={retrying}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-card hover:bg-primary/5 transition-colors disabled:opacity-50"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                        >
                          <RefreshCw className={cn("w-3 h-3", retrying && "animate-spin")} />
                          {retrying ? "Аналізується…" : "Повторний аналіз"}
                        </button>
                      )}
                    </div>
                    {retryError && <p className="text-xs text-red-500 mt-1">{retryError}</p>}
                  </div>
                </div>
                {analysis?.score != null && (
                  <div className="relative w-16 h-16 shrink-0" title={scoreZone(analysis.score).description}>
                    <svg viewBox="0 0 100 100" className="w-16 h-16 -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-secondary/50" />
                      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                        stroke={scoreZone(analysis.score).hex}
                        strokeDasharray={`${(analysis.score / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                        style={{ transition: "stroke-dasharray 0.4s ease" }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={cn("text-base font-black leading-none", scoreColor(analysis.score))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {analysis.score}
                      </span>
                      <span className="flex items-center gap-0.5 text-[7px] font-semibold text-muted-foreground mt-0.5 leading-none">
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: scoreZone(analysis.score).hex }} />
                        {scoreZone(analysis.score).label}
                      </span>
                    </div>
                  </div>
                )}
                {analysis && analysis.score == null && conv.status === "analyzed" && (
                  <div className="relative group/noscore flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-border bg-secondary/30 text-center px-1">
                    <span className="text-[10px] font-semibold text-muted-foreground leading-tight" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Немає оцінки
                    </span>
                    <span className="absolute right-0 top-full mt-1.5 w-56 bg-[#1C1C1C] text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/noscore:opacity-100 transition-opacity duration-150 z-50 normal-case font-normal"
                      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                      Бал рахується лише для розмов типу "Брифування" і "Презентація КП" — для типу "{conv.conversation_kind || "цей"}" критерії оцінки не застосовні, тому оцінка навмисно не рахується.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Менеджер</p>
                    {conv.manager?.name ? (
                      <Link href={`/team/${generateSlug(conv.manager.name)}`}
                        className="text-primary font-semibold text-xs mt-0.5 hover:underline block"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {conv.manager.name}
                      </Link>
                    ) : (
                      <p className="text-foreground font-semibold text-xs mt-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>—</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Клієнт / Номер</p>
                    {(conv as any).contragent_id ? (
                      <Link href={`/contragents/${(conv as any).contragent_id}`}
                        className="text-primary font-semibold text-xs mt-0.5 hover:underline block"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {clientLabel}
                      </Link>
                    ) : (
                      <p className="text-foreground font-semibold text-xs mt-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {clientLabel}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Дата</p>
                    <p className="text-foreground font-semibold text-xs mt-0.5">{formatDate(conv.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Послуга
                      <Hint text="Послуга визначається автоматично AI під час аналізу дзвінка. Якщо визначено неправильно — натисніть щоб виправити вручну." className="ml-1" />
                    </p>
                    {editingService ? (
                      <div ref={serviceDropdownRef} className="absolute z-50 mt-0.5 bg-card border border-primary/30 rounded-lg shadow-md py-1 min-w-[160px]">
                        <button className="w-full text-left px-3 py-1 text-xs text-muted-foreground hover:bg-secondary" onClick={() => saveServices([])}>— не вказано —</button>
                        {SERVICES.map(s => {
                          const checked = selectedServices.includes(s);
                          return (
                            <button key={s} className={cn("w-full flex items-center gap-2 text-left px-3 py-1 text-xs font-semibold hover:bg-emerald-50 dark:bg-emerald-500/10 hover:text-primary", checked && "text-primary bg-emerald-50 dark:bg-emerald-500/10")} onClick={() => toggleService(s)}>
                              <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0", checked ? "bg-primary border-primary" : "border-border")}>
                                {checked && <span className="text-white text-[10px] leading-none">✓</span>}
                              </span>
                              {s}
                            </button>
                          );
                        })}
                        <button className="w-full text-center px-3 py-1.5 mt-1 text-xs font-bold text-primary border-t border-border" onClick={() => setEditingService(false)}>Готово</button>
                      </div>
                    ) : canEditCoaching ? (
                      <button
                        onClick={() => setEditingService(true)}
                        className="flex items-center gap-1 mt-0.5 group flex-wrap"
                        title="Натисніть щоб змінити (можна декілька)"
                      >
                        {selectedServices.length ? (
                          <span className="text-xs font-semibold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{selectedServices.join(", ")}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">не визначено</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40 group-hover:text-primary transition-colors">✎</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {selectedServices.length ? selectedServices.join(", ") : <span className="text-muted-foreground/50 italic font-normal">не визначено</span>}
                      </span>
                    )}
                    {serviceSaved && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Збережено ✓</p>}
                    {serviceError && <p className="text-[10px] text-red-500 mt-0.5">{serviceError}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 relative">
                  <ListFilter className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Тип розмови
                      <Hint text="Мета цієї розмови (брифування, follow-up, скарга тощо) — окремо від того, яку послугу обговорювали. Визначається автоматично AI, натисніть щоб виправити вручну." className="ml-1" />
                    </p>
                    {editingKind ? (
                      <div ref={kindDropdownRef} className="absolute z-50 mt-0.5 bg-card border border-primary/30 rounded-lg shadow-md py-1 min-w-[200px]">
                        <button className="w-full text-left px-3 py-1 text-xs text-muted-foreground hover:bg-secondary" onClick={() => saveKind(null)}>— не вказано —</button>
                        {CONVERSATION_KINDS.map(k => (
                          <button key={k} className={cn("w-full text-left px-3 py-1 text-xs font-semibold hover:bg-emerald-50 dark:bg-emerald-500/10 hover:text-primary", selectedKind === k && "text-primary bg-emerald-50 dark:bg-emerald-500/10")} onClick={() => saveKind(k)}>
                            {k}
                          </button>
                        ))}
                      </div>
                    ) : canEditCoaching ? (
                      <button
                        onClick={() => setEditingKind(true)}
                        className="flex items-center gap-1 mt-0.5 group flex-wrap"
                        title="Натисніть щоб змінити"
                      >
                        {selectedKind ? (
                          <span className="text-xs font-semibold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{selectedKind}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">не визначено</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40 group-hover:text-primary transition-colors">✎</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        {selectedKind || <span className="text-muted-foreground/50 italic font-normal">не визначено</span>}
                      </span>
                    )}
                    {kindSaved && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Збережено ✓</p>}
                    {kindError && <p className="text-[10px] text-red-500 mt-0.5">{kindError}</p>}
                  </div>
                </div>
                {typeof (conv as any).duration_seconds === "number" && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Тривалість</p>
                      <p className="text-foreground font-semibold text-xs mt-0.5 tabular-nums">
                        {formatDuration((conv as any).duration_seconds)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {(conv as any).planfix_task_id ? (
                <div className="mt-4 pt-4 border-t border-border">
                  <a href={`https://inweb.planfix.com/task/${(conv as any).planfix_task_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <ExternalLink className="w-3.5 h-3.5" /> Відкрити чат у Planfix
                  </a>
                </div>
              ) : (conv as any).google_drive_file_id ? (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Запис зустрічі</p>
                  <a href={`https://drive.google.com/file/d/${(conv as any).google_drive_file_id}/view`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <ExternalLink className="w-3.5 h-3.5" /> Відкрити запис у Google Drive
                  </a>
                </div>
              ) : conv.audio_url && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Запис дзвінка</p>
                  <AudioPlayer src={conv.audio_url} />
                </div>
              )}

              {/* Talk/listen ratio — computed from transcript timestamps, independent
                  of AI score/criteria. Only shown when we actually have it. */}
              {typeof conv.manager_talk_pct === "number" && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-muted-foreground flex items-center" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Хто скільки говорив
                      <Hint text="Якщо з боку менеджера чи клієнта було кілька людей — їхній час підсумовується в одну сторону, показник все одно порахується коректно." className="ml-1" />
                    </p>
                    <p className="text-xs font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <span className="text-primary">Менеджер {conv.manager_talk_pct}%</span>
                      <span className="text-muted-foreground font-normal"> / </span>
                      <span className="text-accent">Клієнт {100 - conv.manager_talk_pct}%</span>
                    </p>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden flex bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${conv.manager_talk_pct}%` }} />
                    <div className="h-full bg-accent" style={{ width: `${100 - conv.manager_talk_pct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Transcript */}
            {conv.transcript ? (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  <MessageSquare className="w-4 h-4 text-foreground" />
                  {conv.type === "chat" ? "Переписка в Telegram" : "Транскрипт розмови"}
                </h3>
                <div className="space-y-3 text-sm">
                  {(() => {
                    const speakerLabels = (analysis as any)?.speaker_labels as Record<string, { label?: string; role?: string }> | undefined;
                    const taggedMoments = ((analysis as any)?.tagged_moments as { quote: string; tag: string }[] | undefined) ?? [];
                    // client_company actually holds the meeting TOPIC (see backend/app/routers/meetings.py),
                    // not the client's company — client_name is the real client/company identifier. Only
                    // meaningful for meetings; calls store just a phone number in client_name.
                    const clientCompany = conv.type === "meeting"
                      ? stripAgencyPrefix((conv as any).client_name)
                      : undefined;

                    // Bubble tint/border are alpha-blended FROM the avatar color (not a fixed
                    // pale hex) specifically so they adapt to the theme automatically: a low-alpha
                    // overlay on a white card reads as a pale tint (light mode), the same overlay
                    // on a dark card reads as a muted dark tint (dark mode) — a fixed light hex
                    // (the old approach) stayed pale in both themes and made the message text
                    // (which DOES follow the theme) unreadable against it in dark mode.
                    const hexToRgba = (hex: string, alpha: number) => {
                      const n = parseInt(hex.slice(1), 16);
                      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
                    };
                    const withTints = (avatars: string[]) => avatars.map(avatar => ({
                      avatar, tint: hexToRgba(avatar, 0.1), border: hexToRgba(avatar, 0.25),
                    }));
                    // #003B29 (brand green) is near-black — fine as a solid avatar-circle bg
                    // (white text on it), but unreadable as TEXT on a dark card. Swap to the
                    // brand's own dark-mode-lightened green (var(--inweb-green), same value
                    // used everywhere else) only for the name label's text color.
                    const nameColor = (avatar: string) => avatar === "#003B29" && theme === "dark" ? "#43A876" : avatar;
                    const MANAGER_PALETTE = withTints(["#003B29", "#EF583D", "#0EA5E9"]);
                    const CLIENT_PALETTE = withTints(["#6B7280", "#F59E0B", "#EC4899", "#10B981"]);

                    // Resolve speaker/role for every line first, so each distinct person
                    // (not just each side/role) can get a stable, distinct color.
                    let firstLetterSeen: string | null = null;
                    // Chat transcripts (backend/app/services/planfix.py) separate distinct
                    // Planfix comments with "\x1e", not "\n" — a real "\n" there is a
                    // paragraph break WITHIN one message (from a <br> in the original comment),
                    // and splitting on it would wrongly spawn a new, speaker-less bubble.
                    // Calls/meetings never contain "\x1e" and keep splitting on "\n" unchanged.
                    // Chats analyzed before this separator existed have no "[MANAGER]"/"[CLIENT]"
                    // tag at all — fall back to "\n" for those so old conversations stay readable
                    // instead of collapsing into one giant bubble. NOTE: don't key this off
                    // "\x1e" presence directly — Python's str.join() never inserts a separator
                    // for a single-item list, so a chat with exactly ONE Planfix comment (e.g. a
                    // long unanswered manager message) legitimately has zero "\x1e" bytes despite
                    // being built by the current pipeline; that case must still use "\x1e" (i.e.
                    // stay as one bubble), which checking for the tag instead of the separator
                    // byte correctly gives (caught live 2026-08-14: task 3349021, one big manager
                    // message shattered into dozens of speaker-less "Клієнт" bubbles).
                    const messageSep = conv.type === "chat" && /\[(MANAGER|CLIENT)\]/.test(conv.transcript) ? "\x1e" : "\n";
                    const resolved = conv.transcript.split(messageSep).filter(Boolean).map(line => {
                      // Newer transcripts are prefixed with a "[MM:SS] "/"[H:MM:SS] " timestamp for
                      // calls/meetings (position within the recording), or a full ISO datetime for
                      // chat correspondence (messages span days/weeks, not seconds into a call) —
                      // older transcripts have neither, which is fine, they just won't show a time.
                      const tsMatch = line.match(/^\[([^\]]+)\]\s*/);
                      const rawTimestamp = tsMatch ? tsMatch[1] : null;
                      const timestamp = !rawTimestamp ? null
                        : /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTimestamp) ? rawTimestamp
                        : (() => {
                            const d = new Date(rawTimestamp);
                            return isNaN(d.getTime()) ? rawTimestamp : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                          })();
                      const afterTimestamp = tsMatch ? line.slice(tsMatch[0].length) : line;

                      // Chat transcripts (backend/app/services/planfix.py::build_transcript)
                      // carry a definitive "[MANAGER]"/"[CLIENT]" role tag ahead of the real
                      // Planfix name — a chat can have more than one person per side, so we
                      // can't infer role from the name the way the "менеджер" substring
                      // fallback below does for calls/meetings.
                      const roleTagMatch = afterTimestamp.match(/^\[(MANAGER|CLIENT)\]\s*/);
                      const roleTag = roleTagMatch ? roleTagMatch[1] : null;
                      const rest = roleTagMatch ? afterTimestamp.slice(roleTagMatch[0].length) : afterTimestamp;

                      const colonIdx = rest.indexOf(": ");
                      const rawSpeaker = colonIdx > -1 ? rest.slice(0, colonIdx) : "?";
                      const text = colonIdx > -1 ? rest.slice(colonIdx + 2) : rest;

                      // Meeting transcripts are tagged "Спікер A", "Спікер B"... — resolve the
                      // real name/role Claude identified, if available.
                      const speakerKeyMatch = rawSpeaker.match(/Спікер\s+(\S+)/i);
                      const speakerInfo = speakerKeyMatch ? speakerLabels?.[speakerKeyMatch[1]] : undefined;
                      const speaker = speakerInfo?.label ?? rawSpeaker;
                      let isManager: boolean;
                      if (roleTag) {
                        isManager = roleTag === "MANAGER";
                      } else if (speakerInfo) {
                        isManager = speakerInfo.role === "manager";
                      } else if (speakerKeyMatch) {
                        // Claude hasn't assigned roles for this letter yet (e.g. migration
                        // pending) — fall back to "first letter seen = manager" as a last
                        // resort rather than mislabeling everyone as the client.
                        if (firstLetterSeen === null) firstLetterSeen = speakerKeyMatch[1];
                        isManager = speakerKeyMatch[1] === firstLetterSeen;
                      } else {
                        isManager = rawSpeaker.toLowerCase().includes("менеджер") || rawSpeaker === "Менеджер";
                      }
                      return { speaker, text, isManager, timestamp };
                    });

                    const managerColors = new Map<string, typeof MANAGER_PALETTE[number]>();
                    const clientColors = new Map<string, typeof CLIENT_PALETTE[number]>();
                    resolved.forEach(({ speaker, isManager }) => {
                      const map = isManager ? managerColors : clientColors;
                      if (!map.has(speaker)) {
                        const palette = isManager ? MANAGER_PALETTE : CLIENT_PALETTE;
                        map.set(speaker, palette[map.size % palette.length]);
                      }
                    });

                    return resolved.map(({ speaker, text, isManager, timestamp }, i) => {
                      const colors = (isManager ? managerColors : clientColors).get(speaker)!;
                      const roleLabel = isManager ? "Менеджер Inweb" : `Клієнт${clientCompany ? ` ${clientCompany}` : ""}`;

                      return (
                        <div key={i} className={cn("w-full flex", isManager ? "justify-start" : "justify-end")}>
                          <div className={cn("flex gap-3 max-w-[80%]", !isManager && "flex-row-reverse")}>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 text-white"
                              style={{ fontFamily: "var(--font-unbounded), sans-serif", backgroundColor: colors.avatar }}>
                              {speaker.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm border"
                              style={{ backgroundColor: colors.tint, borderColor: colors.border }}>
                              <span className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif", color: nameColor(colors.avatar) }}>
                                {speaker} <span className="font-normal text-muted-foreground">· {roleLabel}</span>
                                {timestamp && (
                                  <span className="ml-auto font-normal text-muted-foreground/60 tabular-nums" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{timestamp}</span>
                                )}
                              </span>
                              <span className="text-foreground/80 text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                                <TaggedText text={text} canReveal={canRevealSensitive} tags={taggedMoments} />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-5 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {conv.status === "analyzing" ? "Транскрипт ще обробляється…" : "Транскрипт недоступний"}
                </p>
              </div>
            )}
          </div>

          {/* Right: AI analysis */}
          <div className="space-y-4">
            {analysis ? (
              <>
                {analysis.summary && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>AI Підсумок</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
                    {((analysis as any).manager_mood || (analysis as any).client_mood) && (
                      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
                        <Hint text="AI визначає загальний тон по інтонації слів, формулюваннях та поведінці співрозмовника протягом усієї розмови (напр. коротко/різко = напружено, розгорнуті зацікавлені відповіді = зацікавлено)." className="ml-1" />
                        {(analysis as any).manager_mood && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/8 text-primary font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            Менеджер: {normalizeMood((analysis as any).manager_mood)}
                          </span>
                        )}
                        {(analysis as any).client_mood && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent-strong font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            Клієнт: {normalizeMood((analysis as any).client_mood)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(analysis as any).criteria && Object.keys((analysis as any).criteria).length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <BarChart3 className="w-4 h-4" /> Оцінка по критеріях
                    </h3>
                    <div className="space-y-3">
                      {Object.entries((analysis as any).criteria as Record<string, number>)
                        // AI doesn't reliably return criteria in prompt order (esp. Sonnet 5) —
                        // sort by the leading "N.M" number in the label (e.g. "1.2 Agenda...")
                        // so the list always reads in the same order the prompt defines them.
                        .sort(([a], [b]) => {
                          const na = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "");
                          const nb = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "");
                          if (isNaN(na) || isNaN(nb)) return 0;
                          return na - nb;
                        })
                        .map(([key, val]) => {
                        // val can be null — the AI is told to return null (not a guessed
                        // "normal" score) when a criterion has no material in this chat at
                        // all (e.g. no objections were ever raised) — render that as "н/д",
                        // never as a 0/100 bar, which would misleadingly read as a bad score.
                        const isNA = typeof val !== "number";
                        const v = isNA ? 0 : val;
                        // Fallback safety net: the AI is instructed to copy criterion names
                        // verbatim (spaces, not underscores), but display cleanly either way.
                        // Numbering ("1.1. ", "2.2. ") stays in the underlying key so sorting is
                        // always stable — it's just not shown, since a clean label reads better.
                        const label = (CRITERIA_LABELS[key] ?? key.replace(/_/g, " ")).replace(/^\d+(?:\.\d+)?\.\s*/, "");
                        const explanation = (analysis as any).criteria_explanations?.[key];
                        const barColor = scoreBarColor(v);
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                {label}
                                {explanation && <Hint text={explanation} className="ml-1" />}
                              </span>
                              {isNA ? (
                                <span className="text-xs font-black text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>н/д</span>
                              ) : (
                                <span className={cn("text-xs font-black", scoreColor(v))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{v}</span>
                              )}
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", isNA ? "bg-secondary" : barColor)} style={{ width: isNA ? "0%" : `${v}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(analysis as any).insights && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <Target className="w-4 h-4" /> Аналітичні висновки
                    </h3>
                    <div className="space-y-3">
                      {(analysis as any).insights.client_pain && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Головний біль клієнта</p>
                          <p className="text-xs text-foreground/80">{(analysis as any).insights.client_pain}</p>
                        </div>
                      )}
                      {(analysis as any).insights.objections && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Заперечення клієнта</p>
                          <p className="text-xs text-foreground/80">{(analysis as any).insights.objections}</p>
                        </div>
                      )}
                      {(analysis as any).insights.price_objection_response && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Реакція на цінове заперечення</p>
                          <p className="text-xs text-foreground/80">{(analysis as any).insights.price_objection_response}</p>
                        </div>
                      )}
                      {(analysis as any).insights.next_steps && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Наступні кроки</p>
                          <p className="text-xs text-foreground/80">{(analysis as any).insights.next_steps}</p>
                        </div>
                      )}
                      {(analysis as any).insights.goal_achieved && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Мета розмови</p>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                              GOAL_ACHIEVED_STYLE[(analysis as any).insights.goal_achieved as string] ?? "bg-secondary text-muted-foreground")}>
                              {(analysis as any).insights.goal_achieved}
                            </span>
                          </div>
                          {(analysis as any).insights.goal_achieved_reasoning && (
                            <p className="text-xs text-muted-foreground">{(analysis as any).insights.goal_achieved_reasoning}</p>
                          )}
                        </div>
                      )}
                      {typeof (analysis as any).insights.conversion_probability === "number" && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ймовірність конверсії</p>
                            <span className={cn("text-xs font-black", conversionColor((analysis as any).insights.conversion_probability))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                              {(analysis as any).insights.conversion_probability}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1">
                            <div className={cn("h-full rounded-full transition-all", conversionBarColor((analysis as any).insights.conversion_probability))} style={{ width: `${(analysis as any).insights.conversion_probability}%` }} />
                          </div>
                          {(analysis as any).insights.conversion_reasoning && (
                            <p className="text-xs text-muted-foreground">{(analysis as any).insights.conversion_reasoning}</p>
                          )}
                        </div>
                      )}
                      <ChatInsightExtras insights={(analysis as any).insights} />
                    </div>
                  </div>
                )}

                {analysis.strengths?.length > 0 && (
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <ThumbsUp className="w-4 h-4" /> Сильні сторони
                    </h3>
                    <ul className="space-y-2">
                      {analysis.strengths.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <BrandCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.weaknesses?.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      <ThumbsDown className="w-4 h-4" /> Зони росту
                    </h3>
                    <ul className="space-y-2">
                      {analysis.weaknesses.map((w: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <BrandClose className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.recommendations?.length > 0 && (
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 dark:border-emerald-500/20 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        <Lightbulb className="w-4 h-4" /> Рекомендації
                      </h3>
                      {conv.manager_id && canEditCoaching && (
                        addedToCoaching ? (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Додано в коучинг ✓</span>
                        ) : (
                          <button onClick={addRecommendationsToCoaching} disabled={addingToCoaching}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                            {addingToCoaching ? "Додаємо…" : "Додати в коучинг"}
                          </button>
                        )
                      )}
                    </div>
                    {coachingError && <p className="text-[11px] text-red-500 mb-2">{coachingError}</p>}
                    <ul className="space-y-2">
                      {analysis.recommendations.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <RankBadge rank={i + 1} className="w-5 h-5 mt-0.5 shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysisHistory.length > 0 && (() => {
                  // analysisHistory arrives oldest-first; the conversation's current
                  // ai_analysis is the newest point of all — appending it here is what
                  // makes the sparkline and the top entry's delta include "up to now".
                  const timeline: HistoryEntry[] = [...analysisHistory, {
                    id: "__current__", score: analysis.score ?? null, summary: analysis.summary ?? null,
                    client_mood: (analysis as any).client_mood ?? null, manager_mood: (analysis as any).manager_mood ?? null,
                    strengths: analysis.strengths ?? null, weaknesses: analysis.weaknesses ?? null,
                    criteria: (analysis as any).criteria ?? null, insights: (analysis as any).insights ?? null,
                    analyzed_at: conv.created_at ?? conv.date,
                  }];
                  const scores = timeline.map(t => t.score).filter((s): s is number => s != null);
                  const minS = scores.length ? Math.min(...scores) : 0;
                  const maxS = scores.length ? Math.max(...scores) : 100;
                  const range = Math.max(maxS - minS, 1);
                  const sparkPoints = scores.map((s, i) => {
                    const x = scores.length > 1 ? (i / (scores.length - 1)) * 100 : 50;
                    const y = 32 - ((s - minS) / range) * 28 - 2;
                    return `${x},${y}`;
                  }).join(" ");
                  // Same rule as the Контрагенти sparkline: rising (last >= first) is
                  // green, falling is red — one shared color language for trend across
                  // the whole app, instead of a neutral color that means nothing.
                  const sparkRising = scores.length > 1 ? scores[scores.length - 1] >= scores[0] : true;
                  const sparkColor = sparkRising ? "#10b981" : "#ef4444";

                  return (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                          <History className="w-4 h-4" /> Історія аналізів
                        </h3>
                        {scores.length > 1 && (
                          <svg viewBox="0 0 100 32" className="w-24 h-8 shrink-0" preserveAspectRatio="none">
                            <polyline points={sparkPoints} fill="none" stroke={sparkColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Цей чат переаналізується щотижня по мірі нових повідомлень — тут попередні знімки оцінки, до того, як їх замінив останній аналіз. Натисни на запис, щоб відкрити повний аналіз того моменту.
                      </p>
                      <div className="space-y-1">
                        {[...analysisHistory].reverse().map((h, idxFromEnd) => {
                          // Delta vs the entry right before this one chronologically —
                          // timeline is oldest-first, this list is newest-first, so the
                          // "previous" entry is the NEXT one in the reversed array.
                          const chronoIndex = analysisHistory.length - 1 - idxFromEnd;
                          const prevEntry = timeline[chronoIndex];
                          const scoreDelta = h.score != null && prevEntry?.score != null ? h.score - prevEntry.score : null;
                          return (
                            <button key={h.id} onClick={() => setHistoryModalEntry(h)}
                              className="w-full flex items-start gap-3 text-left hover:bg-secondary/30 -mx-1 px-1 py-1.5 rounded-md transition-colors border-t border-border first:border-t-0">
                              <div className="w-11 h-11 rounded-lg border-2 border-border shrink-0 flex flex-col items-center justify-center">
                                {h.score != null ? (
                                  <span className={cn("text-sm font-black", scoreColor(h.score))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{h.score}</span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60 text-center leading-tight">без оцінки</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                  {formatDate(h.analyzed_at)}
                                  {scoreDelta != null && scoreDelta !== 0 && (
                                    <span className={cn("font-semibold", scoreDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                                      {scoreDelta > 0 ? "▲" : "▼"} {Math.abs(scoreDelta)}
                                    </span>
                                  )}
                                  {h.client_mood && <>· Клієнт: {normalizeMood(h.client_mood)}</>}
                                </p>
                                {h.summary && <p className="text-xs text-foreground/80 mt-0.5">{h.summary}</p>}
                              </div>
                              <BrandArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-3" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="bg-card border border-border rounded-xl p-5 text-center">
                <BarChart3 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {conv.status === "analyzing" ? "Аналіз виконується…" : "Аналіз ще не готовий"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">Зазвичай займає до 5 хвилин після завершення дзвінка</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {historyModalEntry && (
        <HistoryAnalysisModal entry={historyModalEntry} criteriaExplanations={(analysis as any)?.criteria_explanations ?? null} onClose={() => setHistoryModalEntry(null)} />
      )}
    </div>
  );
}

function HistoryAnalysisModal({ entry, criteriaExplanations, onClose }: {
  entry: { score: number | null; summary: string | null; client_mood: string | null; manager_mood: string | null; strengths: string[] | null; weaknesses: string[] | null; criteria: Record<string, number> | null; insights: Record<string, any> | null; analyzed_at: string };
  criteriaExplanations: Record<string, string> | null;
  onClose: () => void;
}) {
  const insights = entry.insights;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Знімок аналізу</p>
            <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{formatDate(entry.analyzed_at)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {entry.summary && (
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-foreground mb-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>AI Підсумок</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{entry.summary}</p>
            {(entry.manager_mood || entry.client_mood) && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
                {entry.manager_mood && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/8 text-primary font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    Менеджер: {normalizeMood(entry.manager_mood)}
                  </span>
                )}
                {entry.client_mood && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent-strong font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    Клієнт: {normalizeMood(entry.client_mood)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {entry.criteria && Object.keys(entry.criteria).length > 0 && (
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <BarChart3 className="w-3.5 h-3.5" /> Оцінка по критеріях
            </h3>
            <div className="space-y-2.5">
              {Object.entries(entry.criteria)
                .sort(([a], [b]) => {
                  const na = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "");
                  const nb = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "");
                  if (isNaN(na) || isNaN(nb)) return 0;
                  return na - nb;
                })
                .map(([key, val]) => {
                  const isNA = typeof val !== "number";
                  const v = isNA ? 0 : (val as number);
                  const label = (CRITERIA_LABELS[key] ?? key.replace(/_/g, " ")).replace(/^\d+(?:\.\d+)?\.\s*/, "");
                  const explanation = criteriaExplanations?.[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {label}
                          {explanation && <Hint text={explanation} className="ml-1" />}
                        </span>
                        {isNA ? (
                          <span className="text-xs font-black text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>н/д</span>
                        ) : (
                          <span className={cn("text-xs font-black", scoreColor(v))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{v}</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", isNA ? "bg-secondary" : scoreBarColor(v))} style={{ width: isNA ? "0%" : `${v}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {insights && (
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <Target className="w-3.5 h-3.5" /> Аналітичні висновки
            </h3>
            <div className="space-y-2.5">
              {insights.client_pain && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Головний біль клієнта</p>
                  <p className="text-xs text-foreground/80">{insights.client_pain}</p>
                </div>
              )}
              {insights.objections && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Заперечення клієнта</p>
                  <p className="text-xs text-foreground/80">{insights.objections}</p>
                </div>
              )}
              {insights.price_objection_response && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Реакція на цінове заперечення</p>
                  <p className="text-xs text-foreground/80">{insights.price_objection_response}</p>
                </div>
              )}
              {insights.next_steps && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Наступні кроки</p>
                  <p className="text-xs text-foreground/80">{insights.next_steps}</p>
                </div>
              )}
              {insights.goal_achieved && (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Мета розмови</p>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      GOAL_ACHIEVED_STYLE[insights.goal_achieved as string] ?? "bg-secondary text-muted-foreground")}>
                      {insights.goal_achieved}
                    </span>
                  </div>
                  {insights.goal_achieved_reasoning && (
                    <p className="text-xs text-muted-foreground">{insights.goal_achieved_reasoning}</p>
                  )}
                </div>
              )}
              {typeof insights.conversion_probability === "number" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ймовірність конверсії</p>
                    <span className={cn("text-xs font-black", conversionColor(insights.conversion_probability))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      {insights.conversion_probability}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1">
                    <div className={cn("h-full rounded-full transition-all", conversionBarColor(insights.conversion_probability))} style={{ width: `${insights.conversion_probability}%` }} />
                  </div>
                  {insights.conversion_reasoning && <p className="text-xs text-muted-foreground">{insights.conversion_reasoning}</p>}
                </div>
              )}
              <ChatInsightExtras insights={insights} />
            </div>
          </div>
        )}

        {entry.strengths && entry.strengths.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <ThumbsUp className="w-3.5 h-3.5" /> Сильні сторони
            </h3>
            <ul className="space-y-1.5">
              {entry.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <BrandCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {entry.weaknesses && entry.weaknesses.length > 0 && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <ThumbsDown className="w-3.5 h-3.5" /> Зони росту
            </h3>
            <ul className="space-y-1.5">
              {entry.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <BrandClose className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />{w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
