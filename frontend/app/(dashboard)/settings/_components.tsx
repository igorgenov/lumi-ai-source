"use client";
import { BrandCheck, BrandArrowRight } from "@/components/icons/brand-icons";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { cn, wordDiff } from "@/lib/utils";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  X, Plus, Trash2, Phone, Video, Shield, RefreshCw,
  Copy, Eye, EyeOff, Mail, Send, ChevronDown, Sparkles, Users, FileText, Activity, Link2, Link2Off,
} from "lucide-react";

// ── Report types & constants ───────────────────────────────────────────────────
export type ReportFrequency = "daily" | "weekly" | "monthly";
export type ReportContent = {
  aiScore: boolean; callCount: boolean; conversion: boolean;
  topManagers: boolean; lowScoreManagers: boolean; aiRecommendations: boolean;
};
export type ScheduledReport = {
  id: string; name: string; frequency: ReportFrequency;
  dayOfWeek?: string; dayOfMonth?: number; time: string;
  channels: { telegram: boolean };
  content: ReportContent; active: boolean;
  managerIds?: string[];
  convType?: "all" | "call" | "meeting" | "chat";
};
const FREQ_LABELS: Record<ReportFrequency, string> = { daily: "Щодня", weekly: "Щотижня", monthly: "Щомісяця" };
const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const CONTENT_OPTIONS: { key: keyof ReportContent; label: string; desc: string }[] = [
  { key: "aiScore",           label: "AI-бал команди",              desc: "Середній AI-бал за обраний період" },
  { key: "callCount",         label: "Кількість дзвінків",          desc: "Загальна кількість оброблених розмов" },
  { key: "conversion",        label: "Цільові дзвінки",             desc: "% дзвінків, що були цільовими (не «Не цільова»)" },
  { key: "topManagers",       label: "Топ менеджери",               desc: "3 менеджери з найвищим балом" },
  { key: "lowScoreManagers",  label: "Команда з низьким балом",   desc: "Потребують уваги керівника" },
  { key: "aiRecommendations", label: "Рекомендації AI",             desc: "Ключові поради для команди" },
];
const DEFAULT_CONTENT: ReportContent = { aiScore: true, callCount: true, conversion: true, topManagers: true, lowScoreManagers: false, aiRecommendations: false };
const DEFAULT_NEW_REPORT: Omit<ScheduledReport, "id"> = { name: "Новий звіт", frequency: "weekly", dayOfWeek: "Пн", time: "09:00", channels: { telegram: true }, content: { ...DEFAULT_CONTENT }, active: true, managerIds: [], convType: "all" };

// ── localStorage helpers ──────────────────────────────────────────────────────
export function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
export function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Reusable UI ───────────────────────────────────────────────────────────────
export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 w-full min-w-0 overflow-hidden">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 bg-card text-foreground";

export function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!enabled)} disabled={disabled}
      className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0",
        disabled && "cursor-not-allowed",
        enabled ? "bg-primary" : "bg-muted")}>
      <span className={cn("absolute top-[2px] w-4 h-4 bg-card rounded-full shadow-sm transition-all duration-200",
        enabled ? "left-[22px]" : "left-[2px]")} />
    </button>
  );
}

export function SaveButton({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <button onClick={onClick}
      className={cn(
        "mt-5 px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
        saved
          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
          : "bg-primary text-white hover:bg-primary-hover"
      )}
      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
      {saved ? <><BrandCheck className="w-3.5 h-3.5" /> Збережено</> : "Зберегти зміни"}
    </button>
  );
}

export function useSaved() {
  const [saved, setSaved] = useState(false);
  const trigger = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);
  return { saved, trigger };
}

// ── PROFILE TAB ───────────────────────────────────────────────────────────────
export function ProfileTab() {
  const { saved: infoSaved, trigger: triggerInfo } = useSaved();
  const { data: session } = useSession();

  // Server-backed (managers.position/phone), not localStorage — otherwise a
  // different admin, or the same admin on a new device, would never see the
  // real saved values, only whatever this one browser happened to cache.
  const [info, setInfo] = useState({ position: "", phone: "" });
  const [infoLoading, setInfoLoading] = useState(true);
  useEffect(() => {
    fetch("/api/team/me")
      .then(r => r.json())
      .then(data => setInfo({ position: data.position ?? "", phone: data.phone ?? "" }))
      .catch(() => {})
      .finally(() => setInfoLoading(false));
  }, []);

  const userName = session?.user?.name ?? "Користувач";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image ?? null;

  async function saveInfo() {
    try {
      await fetch("/api/team/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: info.position, phone: info.phone }),
      });
    } catch { /* non-critical */ }
    triggerInfo();
  }

  return (
    <div className="space-y-4">
      <Section title="Особиста інформація" description="Ваші дані відображаються в системі">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-primary flex items-center justify-center text-white text-2xl font-black shrink-0"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }} suppressHydrationWarning>
            {userImage
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={userImage} alt={userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{userName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{userEmail}</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5">Фото підтягується з вашого Google-акаунта</p>
          </div>
        </div>

        <div className="p-3 mb-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg flex items-start gap-3">
          <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Вхід через Google Workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">Доступ контролюється корпоративною поштою. При звільненні співробітника — вимкніть акаунт у Google Workspace, і він автоматично втратить доступ.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ім&apos;я (з Google)</label>
            <input className={cn(inputCls, "bg-muted text-muted-foreground cursor-not-allowed")} value={userName} readOnly />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Email (з Google)</label>
            <input className={cn(inputCls, "bg-muted text-muted-foreground cursor-not-allowed")} value={userEmail} readOnly />
          </div>
          <Field label="Посада">
            <input className={inputCls} value={info.position} disabled={infoLoading}
              placeholder={infoLoading ? "Завантаження…" : "Напр. Керівник відділу продажу"}
              onChange={e => setInfo(p => ({ ...p, position: e.target.value }))} />
          </Field>
          <Field label="Телефон">
            <input className={inputCls} value={info.phone} disabled={infoLoading}
              placeholder={infoLoading ? "Завантаження…" : "+380 XX XXX XX XX"}
              onChange={e => setInfo(p => ({ ...p, phone: e.target.value }))} />
          </Field>
        </div>
        <SaveButton onClick={saveInfo} saved={infoSaved} />
      </Section>
    </div>
  );
}

// ── INTEGRATIONS TAB ──────────────────────────────────────────────────────────
type MeetingSource = { folder_id: string; enabled: boolean; since_date: string; manager: { id: string; name: string } | { id: string; name: string }[] | null };

export function IntegrationsTab() {
  const confirm = useConfirm();
  const [sources, setSources] = useState<MeetingSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [savingFolder, setSavingFolder] = useState<string | null>(null);

  function loadSources() {
    setSourcesLoading(true);
    fetch("/api/meeting-sources")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSources(data); })
      .catch(() => {})
      .finally(() => setSourcesLoading(false));
  }
  useEffect(() => { loadSources(); }, []);

  async function patchSource(folder_id: string, fields: { enabled?: boolean; since_date?: string }) {
    setSavingFolder(folder_id);
    setSources(prev => prev.map(s => s.folder_id === folder_id ? { ...s, ...fields } : s));
    await fetch("/api/meeting-sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id, ...fields }),
    });
    setSavingFolder(null);
  }

  const [legacyFoldersExpanded, setLegacyFoldersExpanded] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({ folder_id: "", manager_id: "" });
  const [addingSource, setAddingSource] = useState(false);
  const [addSourceError, setAddSourceError] = useState("");

  async function addSource() {
    if (!newSource.folder_id.trim() || !newSource.manager_id) {
      setAddSourceError("Вкажіть ID папки та оберіть менеджера");
      return;
    }
    setAddingSource(true);
    setAddSourceError("");
    const res = await fetch("/api/meeting-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSource),
    });
    if (res.ok) {
      setNewSource({ folder_id: "", manager_id: "" });
      setShowAddSource(false);
      loadSources();
    } else {
      const d = await res.json().catch(() => ({}));
      setAddSourceError(d.error ?? "Помилка додавання");
    }
    setAddingSource(false);
  }

  async function deleteSource(folder_id: string) {
    const ok = await confirm({
      title: "Прибрати цю папку з інтеграції?",
      description: "Уже проаналізовані зустрічі залишаться — прибереться лише подальше автоматичне відстеження цієї папки.",
      danger: false,
    });
    if (!ok) return;
    setSavingFolder(folder_id);
    await fetch("/api/meeting-sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id }),
    });
    setSources(prev => prev.filter(s => s.folder_id !== folder_id));
    setSavingFolder(null);
  }
  const [apiManagers, setApiManagers] = useState<{ id: string; name: string; email: string; role: string; avatar_url?: string | null }[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [driveAccountEmail, setDriveAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    setManagersLoading(true);
    fetch("/api/team")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setApiManagers(data.map((m: any) => ({ id: m.id, name: m.name, email: m.email, role: m.role, avatar_url: m.avatar_url ?? null })));
      })
      .catch(() => {})
      .finally(() => setManagersLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/google-drive/account")
      .then(r => r.json())
      .then(data => { if (data?.email) setDriveAccountEmail(data.email); })
      .catch(() => {});
  }, []);

  // Per-manager Drive OAuth — each manager self-authorizes their own Drive with one
  // click, no more manual folder-sharing that breaks every time Google rotates the
  // "Google Meet" root folder (see project_meet_folder_access_fragility memory).
  const [driveConnections, setDriveConnections] = useState<{ manager_id: string; google_email: string | null; connected_at: string }[]>([]);
  const [driveConnLoading, setDriveConnLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  function loadDriveConnections() {
    setDriveConnLoading(true);
    fetch("/api/meetings/drive-status")
      .then(r => r.json())
      .then(data => setDriveConnections(data.connections ?? []))
      .catch(() => {})
      .finally(() => setDriveConnLoading(false));
  }
  useEffect(() => { loadDriveConnections(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive_connected")) {
      loadDriveConnections();
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function disconnectDrive(managerId: string) {
    const ok = await confirm({
      title: "Відключити Google Диск цього менеджера?",
      description: "Lumi більше не зможе автоматично знаходити його нові записи зустрічей, поки він не підключиться знову.",
      danger: true,
    });
    if (!ok) return;
    setDisconnectingId(managerId);
    await fetch("/api/meetings/drive-disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manager_id: managerId }),
    });
    setDriveConnections(prev => prev.filter(c => c.manager_id !== managerId));
    setDisconnectingId(null);
  }

  const [chatSync, setChatSync] = useState<{ enabled: boolean; since_date: string | null; chatCount: number } | null>(null);
  const [chatSyncSaving, setChatSyncSaving] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/chat-sync")
      .then(r => r.json())
      .then(data => { if (!data.error) setChatSync(data); })
      .catch(() => {});
  }, []);

  async function toggleChatSync(v: boolean) {
    setChatSyncSaving(true);
    setChatSync(prev => prev ? { ...prev, enabled: v } : prev);
    await fetch("/api/integrations/chat-sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: v }),
    });
    setChatSyncSaving(false);
  }

  return (
    <div className="space-y-4">
      <Section title="Google Drive / Google Meet" description="Автоматична транскрипція та AI-аналіз записів зустрічей менеджерів">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Video className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Google Drive API</p>
            <p className="text-xs text-muted-foreground">Кожен менеджер — окреме джерело, вмикається незалежно</p>
          </div>
          <span className="text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-green-200 dark:border-green-500/30 dark:border-green-500/20 font-bold px-2.5 py-1 rounded-full" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Підключено</span>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>OAuth-підключення (рекомендовано)</label>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2.5">
            Менеджер сам один раз авторизується через Google — доступ до Диска більше ніколи не потрібно відкривати вручну, навіть коли Google перестворює папку "Google Meet".
          </p>
          {driveConnLoading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Завантаження…</span>
            </div>
          ) : (
            <div className="space-y-2">
              {apiManagers.filter(m => m.role === "pm").map(m => {
                const conn = driveConnections.find(c => c.manager_id === m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                    <ManagerAvatar name={m.name} avatarUrl={m.avatar_url} className="w-7 h-7 rounded-full text-xs shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{m.name}</p>
                      {conn && <p className="text-[10px] text-muted-foreground truncate">{conn.google_email ?? "підключено"}</p>}
                    </div>
                    {conn ? (
                      <>
                        <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-green-200 dark:border-green-500/30 dark:border-green-500/20 flex items-center gap-1 shrink-0"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                          <Link2 className="w-3 h-3" /> Підключено
                        </span>
                        <button onClick={() => disconnectDrive(m.id)} disabled={disconnectingId === m.id}
                          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1 disabled:opacity-40" title="Відключити">
                          <Link2Off className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <a href={`/api/meetings/drive-connect?manager_id=${m.id}`}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-md border border-primary/30 text-primary hover:bg-primary/5 transition-colors shrink-0"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        Підключити
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button onClick={() => setLegacyFoldersExpanded(v => !v)}
          className="w-full flex items-center justify-between mb-2 group">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", legacyFoldersExpanded ? "rotate-180" : "")} />
            Папки менеджерів (запасний варіант)
          </span>
        </button>

        {legacyFoldersExpanded && (
        <>
        <div className="flex items-center justify-end mb-2">
          <button onClick={() => { setShowAddSource(v => !v); setAddSourceError(""); }}
            className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Plus className="w-3 h-3" /> Додати папку
          </button>
        </div>

        {showAddSource && (
          <div className="border border-primary/20 rounded-lg p-3 bg-emerald-50 dark:bg-emerald-500/10 space-y-2 mb-3">
            <p className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Нове джерело</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={newSource.manager_id} onChange={e => setNewSource(p => ({ ...p, manager_id: e.target.value }))}
                className="px-2.5 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20 bg-card">
                <option value="">Оберіть менеджера</option>
                {apiManagers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input value={newSource.folder_id} onChange={e => setNewSource(p => ({ ...p, folder_id: e.target.value }))}
                placeholder="ID папки Google Drive"
                className="px-2.5 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20 bg-card" />
            </div>
            {addSourceError && <p className="text-xs text-red-500">{addSourceError}</p>}
            <div className="flex gap-2">
              <button onClick={addSource} disabled={addingSource}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-60 transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {addingSource ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3 h-3" />}
                Додати
              </button>
              <button onClick={() => { setShowAddSource(false); setAddSourceError(""); }}
                className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-primary bg-card transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Скасувати
              </button>
            </div>
          </div>
        )}

        {sourcesLoading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground">Завантаження…</span>
          </div>
        ) : sources.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Джерела не налаштовані</p>
        ) : (
          <div className="space-y-3">
            {sources.map(s => {
              const mgr = Array.isArray(s.manager) ? s.manager[0] : s.manager;
              return (
                <div key={s.folder_id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
                  <Toggle enabled={s.enabled} onChange={v => patchSource(s.folder_id, { enabled: v })} />
                  <div className="w-40 shrink-0 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{mgr?.name ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.folder_id}</p>
                  </div>
                  <div className="flex-1 flex items-center gap-2 justify-end">
                    <label className="text-[10px] text-muted-foreground whitespace-nowrap">Аналізувати з:</label>
                    <input type="date" value={s.since_date?.slice(0, 10) ?? ""}
                      onChange={e => patchSource(s.folder_id, { since_date: new Date(e.target.value).toISOString() })}
                      className="px-2 py-1 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20 bg-card" />
                    {savingFolder === s.folder_id && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                  </div>
                  <button onClick={() => deleteSource(s.folder_id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1" title="Прибрати папку">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">Старі зустрічі до дати "Аналізувати з" ніколи не транскрибуються — лише нові записи, що з'являються в папці після цієї дати.</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Доступ до папки має бути наданий Google-акаунту, підключеному до системи{driveAccountEmail ? <> — <span className="font-semibold text-foreground">{driveAccountEmail}</span></> : ""}, інакше нові записи в ній не будуть знайдені.
        </p>
        </>
        )}
      </Section>

      <Section title="Telegram-чати (Planfix)" description="AI-аналіз переписки менеджерів з клієнтами в Telegram, синхронізованої через Planfix">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Send className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Planfix REST API</p>
            <p className="text-xs text-muted-foreground">Один спільний перемикач для всього відділу продажів, не по менеджерах</p>
          </div>
          <span className="text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-green-200 dark:border-green-500/30 dark:border-green-500/20 font-bold px-2.5 py-1 rounded-full" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Підключено</span>
        </div>

        {!chatSync ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground">Завантаження…</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5">
            <Toggle enabled={chatSync.enabled} onChange={toggleChatSync} disabled={chatSyncSaving} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                {chatSync.enabled ? "Синхронізація увімкнена" : "Синхронізація вимкнена"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Проаналізовано {chatSync.chatCount} {chatSync.chatCount === 1 ? "чат" : "чатів"} · враховуються повідомлення з {chatSync.since_date ? new Date(chatSync.since_date).toLocaleDateString("uk-UA") : "—"}
              </p>
            </div>
            {chatSyncSaving && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
          Переписка до дати відліку вище ніколи не аналізується — лише повідомлення, що надійшли після неї. Цю дату навмисно не можна змінити тут самостійно — вона впливає одразу на всіх клієнтів компанії; звернись, якщо її потрібно змінити.
        </p>
      </Section>
    </div>
  );
}

// ── MANAGERS TAB ──────────────────────────────────────────────────────────────
type MgrRow = { id: string; name: string; email: string; role: string; position: string; avatar_url?: string | null };

export function ManagersTab() {
  const { data: session } = useSession();
  const currentEmail = session?.user?.email ?? "";
  const confirm = useConfirm();

  const [managers, setManagers] = useState<MgrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newMgr, setNewMgr] = useState({ name: "", email: "", role: "manager", position: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, manager: 2, viewer: 3 };

  useEffect(() => {
    fetch("/api/team")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setManagers([...data].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeRole(id: string, role: string) {
    setSaving(id);
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }) });
    setManagers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    setSaving(null);
  }

  async function changeName(id: string, name: string) {
    setSaving(id);
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) });
    setSaving(null);
  }

  async function changePosition(id: string, position: string) {
    setSaving(id);
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, position }) });
    setManagers(prev => prev.map(m => m.id === id ? { ...m, position } : m));
    setSaving(null);
  }

  async function removeManager(id: string) {
    const mgr = managers.find(m => m.id === id);
    const ok = await confirm({
      title: "Видалити менеджера?",
      description: `${mgr?.name ?? "Цей користувач"} втратить доступ до HuyumiAI. Історія його розмов та оцінок залишиться в базі.`,
    });
    if (!ok) return;
    await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setManagers(prev => prev.filter(m => m.id !== id));
  }

  async function addManager() {
    if (!newMgr.email) return;
    setError(null);
    setAdding(true);
    const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newMgr) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка"); setAdding(false); return; }
    setManagers(prev => [...prev, data]);
    setNewMgr({ name: "", email: "", role: "manager", position: "" });
    setShowAdd(false);
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      <Section title="Команда та доступи" description="Управління ролями — зміни набувають чинності при наступному вході">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {managers.map(mgr => (
              <div key={mgr.id} className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg hover:bg-emerald-50 dark:bg-emerald-500/10 hover:border-emerald-100 dark:border-emerald-500/20 transition-colors">
                <ManagerAvatar name={mgr.name} avatarUrl={mgr.avatar_url} className="w-9 h-9 rounded-lg text-sm shrink-0" />
                <div className="flex-1 min-w-0">
                  <input defaultValue={mgr.name}
                    onBlur={e => { if (e.target.value !== mgr.name) changeName(mgr.id, e.target.value); }}
                    className="text-sm font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary/40 focus:outline-none w-full"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }} />
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{mgr.email}</p>
                  <input defaultValue={mgr.position ?? ""} placeholder="Посада"
                    onBlur={e => { if (e.target.value !== (mgr.position ?? "")) changePosition(mgr.id, e.target.value); }}
                    className="text-xs text-muted-foreground mt-0.5 bg-transparent border-b border-transparent hover:border-border focus:border-primary/40 focus:outline-none w-full placeholder:text-muted-foreground/50"
                    style={{ fontFamily: "var(--font-geist-sans), sans-serif" }} />
                </div>
                {mgr.email === currentEmail && <span className="text-[10px] text-primary/50 shrink-0">це ви</span>}
                {mgr.role === "owner" ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-md border bg-primary text-white border-primary shrink-0"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>🔒 Власник</span>
                ) : (
                  <select value={mgr.role} onChange={e => changeRole(mgr.id, e.target.value)} disabled={saving === mgr.id}
                    className="text-xs border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-card text-foreground disabled:opacity-50 shrink-0">
                    <option value="viewer">Перегляд</option>
                    <option value="manager">Менеджер</option>
                    <option value="admin">Адміністратор</option>
                  </select>
                )}
                {saving === mgr.id && <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
                {mgr.role !== "owner" && mgr.email !== currentEmail && (
                  <button onClick={() => removeManager(mgr.id)} className="text-muted-foreground hover:text-red-500 transition-colors p-1 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-xs text-primary font-bold hover:underline" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Plus className="w-4 h-4" /> Додати користувача
          </button>
        ) : (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg">
            <p className="text-xs font-bold text-foreground mb-3" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Новий користувач</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ім&apos;я та прізвище <span className="font-normal text-muted-foreground">(необов&apos;язково)</span></label>
                <input value={newMgr.name} onChange={e => setNewMgr(p => ({ ...p, name: e.target.value }))}
                  placeholder="Якщо порожньо — візьметься з Google при вході" className="px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-card" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Email (@inweb.ua)</label>
                <input value={newMgr.email} onChange={e => setNewMgr(p => ({ ...p, email: e.target.value }))}
                  placeholder="name@inweb.ua" type="email" className="px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-card" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Посада</label>
                <input value={newMgr.position} onChange={e => setNewMgr(p => ({ ...p, position: e.target.value }))}
                  placeholder="Менеджер з продажу" className="px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-card" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Роль</label>
                <select value={newMgr.role} onChange={e => setNewMgr(p => ({ ...p, role: e.target.value }))}
                  className="px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-card">
                  <option value="viewer">Перегляд</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Адміністратор</option>
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={addManager} disabled={!newMgr.email || adding}
                className="px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {adding && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Додати
              </button>
              <button onClick={() => { setShowAdd(false); setError(null); setNewMgr({ name: "", email: "", role: "manager", position: "" }); }}
                className="px-4 py-2 text-xs font-bold border border-border rounded-lg text-muted-foreground hover:text-primary transition-colors bg-card"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Скасувати
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">Зміна ролі набуває чинності при наступному вході користувача в систему.</p>
      </Section>

      <Section title="Рівні доступу" description="Що бачить кожна роль">
        <div className="space-y-2 text-xs">
          {[
            { role: "Власник",        color: "bg-primary/5 border-primary/20", titleColor: "text-primary", access: ["Повний доступ до всього", "Призначення та зняття ролей адміністраторів", "Налаштування інтеграцій та білінгу", "Єдина роль що не може бути змінена або видалена"] },
            { role: "Адміністратор",  color: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",      titleColor: "text-primary", access: ["Всі розмови команди", "Рейтинги та звіти менеджерів", "Налаштування інтеграцій", "Управління командою", "AI Коучинг для всіх"] },
            { role: "Менеджер",       color: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",       titleColor: "text-amber-700 dark:text-amber-400", access: ["Всі розмови команди (для навчання)", "Власний рейтинг та динаміка", "AI аналіз своїх розмов", "Рекомендації по навчанню", "AI Коучинг"] },
            { role: "Спостерігач",    color: "bg-muted border-border",       titleColor: "text-muted-foreground",  access: ["Дашборд з загальною статистикою", "Всі розмови та AI аналізи (тільки перегляд)", "Інсайти — AI звіти по транскрипціях", "Без доступу до Налаштувань та AI Коучингу", "Для будь-якого співробітника агенції з @inweb.ua"] },
          ].map(({ role, access, color, titleColor }) => (
            <div key={role} className={cn("p-3 border rounded-lg", color)}>
              <div className="flex items-center gap-2 mb-2">
                <p className={cn("font-bold", titleColor)} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{role}</p>
                {role === "Власник" && <span className="text-[10px] text-primary/50">🔒 лише один</span>}
              </div>
              <ul className="space-y-1">
                {access.map(a => (
                  <li key={a} className="flex items-center gap-2 text-muted-foreground">
                    <BrandCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── NOTIFICATIONS TAB ─────────────────────────────────────────────────────────
const DEFAULT_NOTIFICATION_SETTINGS = {
  newCall: true, lowScore: true, pendingAnalysis: false,
  weeklyReport: true, managerUpdate: false, email: true, push: false, threshold: 60,
};

export function NotificationsTab() {
  const { saved: savedEvents, trigger: triggerEvents } = useSaved();
  // Server-backed (managers.notification_settings), not localStorage — otherwise a
  // different admin, or the same admin on a new device, never sees the real saved prefs.
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  useEffect(() => {
    fetch("/api/team/me")
      .then(r => r.json())
      .then(data => setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...(data.notification_settings ?? {}) }))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);
  const set = (key: keyof typeof settings, value: boolean | number) => setSettings(s => ({ ...s, [key]: value }));
  async function saveSettings() {
    try {
      await fetch("/api/team/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_settings: settings }),
      });
    } catch { /* non-critical */ }
    triggerEvents();
  }

  return (
    <div className="space-y-4">
      <Section title="Канали сповіщень" description="Як ви хочете отримувати повідомлення">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 pr-4 bg-muted border border-border rounded-lg overflow-hidden opacity-60">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Push-сповіщення
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Скоро</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Браузерні сповіщення в реальному часі</p>
            </div>
            <Toggle enabled={false} onChange={() => {}} disabled />
          </div>
        </div>
        <SaveButton onClick={saveSettings} saved={savedEvents} />
      </Section>

      <Section title="Типи подій" description="Обирайте, про що отримувати сповіщення">
        <div className="space-y-3">
          {[
            { key: "newCall",         label: "Нова розмова завершена",    desc: "Після кожного дзвінка або зустрічі" },
            { key: "lowScore",        label: "Низький AI-бал",            desc: `Коли бал менеджера нижче ${settings.threshold}` },
            { key: "pendingAnalysis", label: "Очікує аналізу > 1 години", desc: "Нагадування про необроблені розмови" },
            { key: "weeklyReport",    label: "Щотижневий звіт команди",   desc: "Кожного понеділка о 09:00", comingSoon: true },
            { key: "managerUpdate",   label: "Зміна рейтингу менеджера",  desc: "Різке зростання або падіння балів", comingSoon: true },
          ].map(({ key, label, desc, comingSoon }) => (
            <div key={key} className={cn("flex items-center justify-between gap-4 py-3 border-b border-emerald-100 dark:border-emerald-500/20 last:border-0", comingSoon && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  {label}
                  {comingSoon && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Скоро</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
              </div>
              <Toggle
                enabled={comingSoon ? false : (settings[key as keyof typeof settings] as boolean)}
                onChange={v => set(key as keyof typeof settings, v)}
                disabled={comingSoon}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg">
          <p className="text-xs font-bold text-foreground mb-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            Поріг низького балу: <span>{settings.threshold}</span>
          </p>
          <input type="range" min={40} max={80} value={settings.threshold}
            onChange={e => set("threshold", Number(e.target.value))} className="w-full accent-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>40</span><span>80</span></div>
        </div>
        <SaveButton onClick={saveSettings} saved={savedEvents} />
      </Section>
    </div>
  );
}

// ── REPORT CARD ───────────────────────────────────────────────────────────────
type ManagerOption = { id: string; name: string };
function ReportCard({ report, expanded, onToggleExpand, onUpdate, onDelete, onSendNow, sending, sendStatus, managers }: {
  report: ScheduledReport; expanded: boolean; onToggleExpand: () => void;
  onUpdate: (patch: Partial<ScheduledReport>) => void; onDelete: () => void;
  onSendNow: () => void; sending: boolean; sendStatus?: "ok" | "error";
  managers: ManagerOption[];
}) {
  const confirm = useConfirm();
  const schedDesc = report.frequency === "daily" ? `Щодня о ${report.time}`
    : report.frequency === "weekly" ? `Щотижня ${report.dayOfWeek} о ${report.time}`
    : `${report.dayOfMonth ?? 1}-го числа місяця о ${report.time}`;
  const channelLabel = report.channels?.telegram ? "Telegram" : "Канал не обрано";
  async function handleDelete() {
    const ok = await confirm({
      title: "Видалити цей звіт?",
      description: `«${report.name}» перестане надсилатись автоматично. Розклад відновити не можна.`,
    });
    if (ok) onDelete();
  }

  return (
    <div className={cn("border rounded-xl transition-colors overflow-hidden", report.active ? "border-primary/20 bg-card" : "border-border bg-muted")}>
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggleExpand} className="text-muted-foreground hover:text-primary transition-colors shrink-0">
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{report.name}</p>
          <p className="text-xs text-muted-foreground">{schedDesc} · {channelLabel}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border hidden sm:inline-flex", report.active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-green-200 dark:border-green-500/30 dark:border-green-500/20" : "bg-muted text-muted-foreground border-border")} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {report.active ? "Активний" : "Вимкнено"}
          </span>
          <Toggle enabled={report.active} onChange={v => onUpdate({ active: v })} />
          <button onClick={handleDelete} className="text-muted-foreground hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-foreground mb-1.5 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Назва звіту</label>
            <input type="text" value={report.name} onChange={e => onUpdate({ name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
          </div>
          <div>
            <label className="text-xs font-bold text-foreground mb-2 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Розклад</label>
            <div className="flex gap-2 mb-3">
              {(["daily", "weekly", "monthly"] as ReportFrequency[]).map(f => (
                <button key={f} onClick={() => onUpdate({ frequency: f })}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors", report.frequency === f ? "bg-primary text-white border-primary" : "bg-card text-foreground/70 border-border hover:border-primary/30")}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {report.frequency === "weekly" && (
                <div className="flex gap-1">
                  {DAYS_OF_WEEK.map(d => (
                    <button key={d} onClick={() => onUpdate({ dayOfWeek: d })}
                      className={cn("w-9 h-9 rounded-lg text-xs font-bold border transition-colors", report.dayOfWeek === d ? "bg-primary text-white border-primary" : "bg-card text-foreground/70 border-border hover:border-primary/30")}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{d}</button>
                  ))}
                </div>
              )}
              {report.frequency === "monthly" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Число місяця:</span>
                  <input type="number" min={1} max={28} value={report.dayOfMonth ?? 1}
                    onChange={e => onUpdate({ dayOfMonth: Number(e.target.value) })}
                    className="w-16 px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 text-center bg-card text-foreground" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">о</span>
                <input type="time" value={report.time} onChange={e => onUpdate({ time: e.target.value })}
                  className="px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-foreground mb-2 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Що включати у звіт</label>
            <div className="grid grid-cols-2 gap-2">
              {CONTENT_OPTIONS.map(({ key, label, desc }) => {
                const checked = report.content[key];
                return (
                  <label key={key} className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none", checked ? "bg-emerald-50 dark:bg-emerald-500/10 border-green-200 dark:border-green-500/30 dark:border-green-500/20" : "bg-muted border-border hover:border-primary/20")}>
                    <input type="checkbox" checked={checked} onChange={e => onUpdate({ content: { ...report.content, [key]: e.target.checked } })} className="mt-0.5 accent-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          {managers.length > 0 && (
            <div>
              <label className="text-xs font-bold text-foreground mb-2 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Команда <span className="font-normal text-muted-foreground">(порожньо = всі)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {managers.map(m => {
                  const selected = (report.managerIds ?? []).includes(m.id);
                  return (
                    <button key={m.id} onClick={() => {
                      const ids = report.managerIds ?? [];
                      onUpdate({ managerIds: selected ? ids.filter(id => id !== m.id) : [...ids, m.id] });
                    }}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        selected ? "bg-primary text-white border-primary" : "bg-card text-foreground/70 border-border hover:border-primary/30")}>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-foreground mb-2 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип розмов</label>
            <div className="flex gap-2">
              {(["all", "call", "meeting", "chat"] as const).map(t => (
                <button key={t} onClick={() => onUpdate({ convType: t })}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    (report.convType ?? "all") === t ? "bg-primary text-white border-primary" : "bg-card text-foreground/70 border-border hover:border-primary/30")}>
                  {t === "all" ? "Всі" : t === "call" ? "Дзвінки" : t === "meeting" ? "Зустрічі" : "Telegram-чати"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-foreground mb-2 block" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Канали відправки</label>
            <div className="flex gap-3">
              <label className={cn("relative flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors select-none", report.channels?.telegram ? "bg-primary text-white border-primary" : "bg-card text-foreground/70 border-border hover:border-primary/30")}>
                <input type="checkbox" checked={!!report.channels?.telegram} onChange={e => onUpdate({ channels: { telegram: e.target.checked } })} className="sr-only" />
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-bold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Telegram</span>
              </label>
            </div>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Відправити звіт прямо зараз, не чекаючи розкладу</p>
            <button onClick={onSendNow} disabled={sending}
              className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50",
                sendStatus === "ok" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-green-200 dark:border-green-500/30 dark:border-green-500/20"
                : sendStatus === "error" ? "bg-red-50 dark:bg-red-500/10 text-red-500 border-red-200 dark:border-red-500/30"
                : "bg-card text-primary border-primary/30 hover:bg-emerald-50 dark:bg-emerald-500/10")}>
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : sendStatus === "ok" ? <BrandCheck className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sending ? "Відправляємо..." : sendStatus === "ok" ? "Надіслано!" : sendStatus === "error" ? "Помилка відправки" : "Відправити зараз"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── REPORTS TAB ───────────────────────────────────────────────────────────────
export function ReportsTab() {
  const { saved: savedChannels, trigger: triggerChannels } = useSaved();
  const { saved: savedReports, trigger: triggerReports } = useSaved();
  const [channels, setChannels] = useState({ telegramToken: "", telegramChatId: "", telegramChatName: "" });
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [telegramError, setTelegramError] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<string, "ok" | "error">>({});
  const [managers, setManagers] = useState<ManagerOption[]>([]);

  // Load from API on mount
  useEffect(() => {
    fetch("/api/reports/settings").then(r => r.json()).then(d => {
      if (d.telegramToken !== undefined) setChannels(d);
      setChannelsLoaded(true);
    }).catch(() => setChannelsLoaded(true));

    fetch("/api/reports/configs").then(r => r.json()).then(d => {
      if (d.reports?.length) {
        setReports(d.reports);
        setExpandedId(null);
      } else {
        const defaults: ScheduledReport[] = [
          { id: "r1", name: "Щотижневий звіт команди", frequency: "weekly", dayOfWeek: "Пн", time: "09:00", channels: { telegram: true }, content: { aiScore: true, callCount: true, conversion: true, topManagers: true, lowScoreManagers: false, aiRecommendations: false }, active: true },
          { id: "r2", name: "Місячний підсумок", frequency: "monthly", dayOfMonth: 1, time: "10:00", channels: { telegram: true }, content: { aiScore: true, callCount: true, conversion: true, topManagers: true, lowScoreManagers: true, aiRecommendations: true }, active: false },
        ];
        setReports(defaults);
        setExpandedId("r1");
      }
      setReportsLoaded(true);
    }).catch(() => setReportsLoaded(true));

    fetch("/api/team").then(r => r.json()).then(d => {
      const mgrs = (d.managers ?? []).filter((m: any) => m.role === "pm");
      setManagers(mgrs.map((m: any) => ({ id: m.id, name: m.name })));
    }).catch(() => {});

  }, []);

  async function saveChannels() {
    await fetch("/api/reports/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channels),
    });
    triggerChannels();
  }

  async function saveReports() {
    await Promise.all(reports.map(r =>
      fetch("/api/reports/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      })
    ));
    triggerReports();
  }

  async function sendNow(reportId: string, reportName: string) {
    setSendingId(reportId);
    setSendStatus(p => { const n = { ...p }; delete n[reportId]; return n; });
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, periodLabel: reportName }),
      });
      setSendStatus(p => ({ ...p, [reportId]: res.ok ? "ok" : "error" }));
    } catch {
      setSendStatus(p => ({ ...p, [reportId]: "error" }));
    } finally {
      setSendingId(null);
    }
  }

  function addReport() {
    const id = `r${Date.now()}`;
    const newReport: ScheduledReport = { id, ...DEFAULT_NEW_REPORT };
    setReports(r => [...r, newReport]);
    setExpandedId(id);
    fetch("/api/reports/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newReport),
    });
  }

  async function deleteReport(id: string) {
    setReports(r => r.filter(rep => rep.id !== id));
    if (expandedId === id) setExpandedId(null);
    await fetch("/api/reports/configs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function updateReport(id: string, patch: Partial<ScheduledReport>) {
    setReports(r => r.map(rep => rep.id === id ? { ...rep, ...patch } : rep));
    await fetch("/api/reports/configs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  return (
    <div className="space-y-4">
      <Section title="Канали доставки" description="Куди надсилати звіти">
        <div>
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <Send className="w-4 h-4 text-primary" /> Telegram
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Токен бота</label>
              <div className="relative">
                <input type={tokenVisible ? "text" : "password"} value={channels.telegramToken} onChange={e => setChannels(c => ({ ...c, telegramToken: e.target.value }))}
                  placeholder="1234567890:ABCdef-ghijklmnopqrstuvwxyz"
                  className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono bg-card text-foreground" />
                <button type="button" onClick={() => setTokenVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Chat ID групи</label>
                <input type="text" value={channels.telegramChatId} onChange={e => setChannels(c => ({ ...c, telegramChatId: e.target.value }))}
                  placeholder="-1001234567890"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono bg-card text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Назва чату (опціонально)</label>
                <input type="text" value={channels.telegramChatName} onChange={e => setChannels(c => ({ ...c, telegramChatName: e.target.value }))}
                  placeholder="Sales Team"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground" />
              </div>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg space-y-1">
              <p className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Як підключити бота:</p>
              <p className="text-xs text-foreground/80">1. Створіть бота через <span className="font-mono font-bold">@BotFather</span> у Telegram та скопіюйте токен</p>
              <p className="text-xs text-foreground/80">2. Додайте бота в групу та зробіть адміністратором</p>
              <p className="text-xs text-foreground/80">3. Отримайте Chat ID через <span className="font-mono font-bold">@getmyid_bot</span></p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={async () => {
                  setTelegramStatus("testing");
                  try {
                    const res = await fetch("/api/telegram/test", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ token: channels.telegramToken, chatId: channels.telegramChatId }),
                    });
                    const data = await res.json();
                    setTelegramStatus(res.ok ? "ok" : "error");
                    if (!res.ok) setTelegramError(data.error ?? "Помилка");
                  } catch (e: any) {
                    setTelegramStatus("error");
                    setTelegramError(e.message ?? "Помилка мережі");
                  }
                }}
                disabled={!channels.telegramToken || !channels.telegramChatId || telegramStatus === "testing"}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                  telegramStatus === "ok" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-green-200 dark:border-green-500/30 dark:border-green-500/20"
                  : telegramStatus === "error" ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30"
                  : "bg-card text-primary border-primary/30 hover:bg-emerald-50 dark:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed")}>
                {telegramStatus === "testing" ? <RefreshCw className="w-4 h-4 animate-spin" /> : telegramStatus === "ok" ? <BrandCheck className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {telegramStatus === "testing" ? "Перевіряємо..." : telegramStatus === "ok" ? "Повідомлення надіслано!" : telegramStatus === "error" ? "Помилка — перевірте токен" : "Відправити тестове повідомлення"}
              </button>
              {telegramStatus === "error" && telegramError && (
                <span className="text-xs text-red-500">{telegramError}</span>
              )}
            </div>
          </div>
        </div>
        <SaveButton onClick={saveChannels} saved={savedChannels} />
      </Section>

      <Section title="Заплановані звіти" description="Налаштуйте автоматичну відправку звітів">
        <div className="space-y-3">
          {reports.map(report => (
            <ReportCard key={report.id} report={report}
              expanded={expandedId === report.id}
              onToggleExpand={() => setExpandedId(expandedId === report.id ? null : report.id)}
              onUpdate={patch => updateReport(report.id, patch)}
              onDelete={() => deleteReport(report.id)}
              onSendNow={() => sendNow(report.id, report.name)}
              sending={sendingId === report.id}
              sendStatus={sendStatus[report.id]}
              managers={managers} />
          ))}
          {reportsLoaded && reports.length === 0 && <p className="text-sm text-muted-foreground py-2">Немає запланованих звітів. Додайте перший!</p>}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={addReport} className="flex items-center gap-2 px-4 py-2 border border-dashed border-primary/30 text-primary rounded-lg text-sm hover:bg-emerald-50 dark:bg-emerald-500/10 transition-colors">
            <Plus className="w-4 h-4" /> Додати звіт
          </button>
          <SaveButton onClick={saveReports} saved={savedReports} />
        </div>
      </Section>
    </div>
  );
}

// ── CHANGELOG TAB ─────────────────────────────────────────────────────────────
const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: "v3.1",
    date: "17.08.2026",
    items: [
      "**Новий бренд-дизайн Inweb** — оновлені кольори, шрифти й логотип по всьому сайту відповідно до нового брендбуку агенції",
      "**Telegram-чати: розумніший AI-аналіз** — при повторному аналізі чату AI тепер бачить всю історію переписки за останній місяць, а не лише останнє повідомлення, тому висновки й оцінка враховують реальний контекст розмови",
      "**Telegram-чати: менша вартість аналізу** — усунено баг, через який один і той самий чат міг переаналізовуватись повторно без нових повідомлень; активні чати перевіряються раз на тиждень (по понеділках), повний огляд усіх чатів — раз на тиждень по п'ятницях",
      "**Причини відмов і причини вибору: додано колонку «Послуга»** — тепер видно, яку саме послугу клієнт обговорював, окремо від сфери діяльності клієнта (перейменовано в «Сфера»)",
      "**Виправлено: контрагенти більше не дублюються** — раніше один і той самий клієнт із Telegram-чату міг з часом створити кілька карток контрагента",
      "**Темна тема** — тепер сайт можна перемкнути на темну тему кнопкою (сонце/місяць) у хедері, зліва від сповіщень. Вибір запам'ятовується в браузері.",
    ],
  },
  {
    version: "v3.0",
    date: "31.07.2026",
    items: [
      "**Telegram-чати тепер повноцінний тип розмови в HuyumiAI** — переписка з клієнтами аналізується так само, як дзвінки й зустрічі, з тим самим балом, висновками та рекомендаціями",
      "**Додатково: ручне додавання конкретного чату** — на сторінці «Розмови» (кнопка «Додати вручну» → тип «Чат» → посилання на задачу в Planfix), все інше підтягується автоматично",
      "**Захист чутливих даних у переписці** — реквізити (IBAN, номер картки, ЄДРПОУ, ІПН, VAT), надіслані клієнтом прямо в чат, автоматично розмиваються — побачити можна лише кліком, і тільки для менеджера, адміна чи власника акаунту",
      "**Контрагенти — як окрема міні-CRM, синхронізована з Planfix** — угоди клієнта автоматично підтягуються і додаються до картки контрагента, а статус кожної угоди (в процесі, успішно реалізовано, закрито і не реалізовано) оновлюється сам",
      "**Справжня причина відмови по всій воронці** — AI аналізує всю хронологію спілкування з клієнтом (дзвінок-бриф, презентація КП, переписка в Telegram) разом і визначає справжню причину відмови, з порівнянням «заявлена причина vs реальна»",
      "**Ймовірність успішності угоди — з динамікою** — у картці контрагента видно не тільки поточний відсоток, а й тренд від першої розмови до останньої, зі стрілкою й міні-графіком",
      "**Контрагенти: автозаповнення домену** з назви угоди в Planfix, якщо в картки контрагента ще не було домену",
      "**Контрагенти: сигнал «давно нема контакту»** — бейдж у списку, якщо угода з клієнтом ще відкрита, а останній контакт був понад 14 днів тому",
      "**Контрагенти: автоматичний архів неактивних** — 10 робочих днів без жодної розмови, і повернення назад одразу з появою нової",
      "**План розвитку менеджера: рекомендації на основі реальних розмов** — AI сам пропонує ціль, аналізуючи, яка слабкість найчастіше повторюється в реальних оцінених розмовах — можна відредагувати перед збереженням",
      "**Цілі менеджерів тепер ті самі, що й по відділу** — корпоративні цільові показники по зонах, а не довільні особисті числа",
      "**Дашборд і Інсайти: тренд по зонах якості** — видно, як розподіл розмов по червоній/жовтій/зеленій зоні змінювався по тижнях, а не лише разовий знімок",
      "**AI-аналіз розмов: нове поле «Мета розмови»** — окремо від балу AI визначає, чи розмова досягла своєї практичної мети; незалежний сигнал, що не впливає на сам бал",
      "**Рекомендації AI стали конкретнішими** — замість загальних порад тепер готова фраза в лапках, яку менеджер може дослівно сказати наступного разу",
      "**Виправлено: AI іноді «домислював» зайве** (наприклад, тип конкурента, якого клієнт не називав) — тепер пише нейтрально, якщо деталь прямо не прозвучала",
      "**AI Коучинг: один графік замість двох однакових** — у тому самому візуальному стилі, що й на сторінці менеджера",
      "**Хто скільки говорив** — на картці дзвінка чи зустрічі видно % часу менеджера й клієнта в розмові, порахований з таймкодів запису, незалежно від AI-оцінки",
      "**Ключові моменти підсвічуються прямо в транскрипті** — AI відмічає заперечення, болі клієнта та домовленості просто в тексті розмови, щоб не читати все підряд",
    ],
  },
  {
    version: "v2.3",
    date: "16.07.2026",
    items: [
      "**Новий домен lumi.inweb.ua** — короткий і зрозумілий адрес замість довгого технічного посилання. Старе посилання й далі працює, але тепер автоматично перенаправляє на новий домен",
      "**AI Коучинг: кожна вкладка тепер має власне посилання** — можна надіслати комусь прямий лінк одразу на потрібну вкладку (наприклад, на «Скрипти» чи «Зустріч PDP»)",
      "**Виправлено: сильні/слабкі сторони та рекомендації менеджера** тепер рахуються з тих самих розмов, що й AI-бал (всі типи зустрічей), а не з усіх розмов підряд",
      "**Виправлено: AI-висновок у Telegram-звітах** більше не згадує сервісні чи фідбек-дзвінки як «провальні» — вони й так не впливають на розрахунок балів",
      "**Розмови/зустрічі: транскрипт більше не «заїкається»** на повторюваних словах чи звуках через збій розпізнавання мовлення — виправлено для нових записів і почищено 24 вже наявні розмови",
      "**Профіль менеджера: список розмов тепер повноцінна таблиця** з тими самими колонками, що на сторінці «Розмови» (послуга, тип розмови, тривалість, статус тощо)",
      "**Команда: порівняння двох менеджерів** тепер має наочні шкали різниці по кожному показнику та позначку «мало даних», коли вибірка занадто мала для надійного висновку",
      "**Розмови: форма «Додати вручну»** — календар і вибір менеджера тепер в єдиному візуальному стилі з рештою застосунку; дата за замовчуванням бере правильний місцевий час, а не UTC",
      "**Додано журнал видалення промтів та змін папок Google Drive** у «Журнал змін»",
    ],
  },
  {
    version: "v2.2",
    date: "10.07.2026",
    items: [
      "**Розмови: нове поле «Тип розмови»** (Статус-зустріч, Планування спринту, Ретроспектива, Демо/Презентація, Технічне обговорення, Інше) — визначається AI окремо від послуги, з фільтром у списку розмов та Інсайтах",
      "**Середній AI-бал команди/менеджера тепер рахується лише по Брифуванню та Презентації КП** — інші типи розмов (фідбек, крос-продаж тощо) більше не впливають на оцінку ефективності",
      "**«Не цільовий» тепер лише для послуг, яких Inweb не надає** — сервісний follow-up чи скарга по реальній послузі більше не позначається як не цільовий",
      "**Дашборд: новий блок «За типом розмови»**, кольорові смуги «За послугами» відповідно до реальних кольорів послуг",
      "**«Що нового» тепер доступне всім ролям** (раніше — лише адмінам/власнику), з індикатором нової версії у футері",
      "**Витрати на AI: фільтр «По днях»**, гортання історії будь-як далеко назад (раніше — лише останні тижні/місяці), звірка з реальним білінгом Anthropic/AssemblyAI",
      "**Google Drive: видно, який акаунт підключено** — потрібно надавати доступ саме йому",
      "**Виправлено: критичні API-роути дашборду та розмови** тепер мають власну перевірку сесії (не покладаються лише на middleware)",
      "**Додано перші автотести** (підбір промту за менеджером, парсинг VTT-транскрипту) — саме ці місця спричиняли реальні баги цього тижня",
      "**Дашборд: перевпорядковано блоки за пріоритетом** — «Остання активність» тепер зверху (найсвіжіший сигнал), «Топ менеджери» поруч із «Тренд балів менеджерів» знизу",
      "**Розмови: фільтр «⚠ Проблемні»** — одразу видно розмови зі статусом «Помилка» або застряглі в «Очікує» довше години",
      "**Розмови: кнопка «Додати вручну»** — можна вставити готовий текст розмови і одразу запустити AI-аналіз, без запису дзвінка чи зустрічі",
      "**Розмова: кнопка «Додати в коучинг»** переносить рекомендації з розбору дзвінка напряму в план розвитку менеджера",
      "**Менеджер: кнопка «Порівняти з іншим менеджером»** одразу зі сторінки профілю",
      "**Промти: історія версій** з можливістю відновити попередній варіант одним кліком",
      "**Налаштування → Профіль і Сповіщення перенесено в базу даних** — тепер бачать усі адміни, і не скидається на новому пристрої",
      "**Застряглі розмови тепер відновлюються автоматично** кожні 20 хвилин, без ручного втручання",
      "**Новий розділ «Журнал змін» у Налаштуваннях** — хто і коли редагував промти чи видавав/змінював ролі доступу",
    ],
  },
  {
    version: "v2.1",
    date: "06.07.2026",
    items: [
      "**Масовий AI-аналіз перейшов на Claude Sonnet 5** — точніша оцінка критеріїв і надійніше визначення ролей спікерів",
      "**Інсайти: ліміт контексту зріс з 200 тис. до 1 млн токенів** — можна аналізувати значно більше розмов за один запит",
      "**Транскрипти тепер показують таймінг** [ХВ:СЕК] для кожної репліки",
      "**Виправлено визначення ролей спікерів у дзвінках** — менеджер/клієнт тепер визначаються AI за змістом розмови, а не за тим, хто заговорив першим (раніше плутались на вихідних дзвінках)",
      "**Кнопка «Повторний аналіз» тепер доступна для будь-якої розмови** (раніше лише при помилці аналізу) і більше не перезаписує вже встановлену вручну послугу",
      "**Сповіщення «Очікує аналізу > 1 години» тепер реально працює**; неробочі перемикачі сповіщень позначено як «Скоро»",
      "**Профіль: фото тепер підтягується напряму з Google-акаунту** замість непрацюючого ручного завантаження",
      "**Прибрано назву агентства з відображення клієнта в зустрічах** — усюди в інтерфейсі та при збереженні нових записів",
      "**Уніфіковано кольорову палітру бренду на всіх сторінках** — фірмовий колір лише для інтерактивних елементів",
      "**Уніфіковано 5-рівневу шкалу кольорів AI-балу** в усьому додатку",
      "**Графік «Тренд балів менеджерів» тепер підписує тижні номером тижня року** (напр. «Тиж 28»); діапазон 0–100 замість 50–100",
      "**Telegram-звіт: динаміка відносно попереднього періоду**, розбивка дзвінки/зустрічі, кількість «не цільових», клікабельні імена менеджерів, реальний AI-висновок",
      "**Виправлено застарілі дані у списку розмов, дашборді та менеджерах** після нових дзвінків/зустрічей (кешування відповіді сервера)",
      "**Новий розділ «Витрати на AI» в Налаштуваннях** — скільки коштує AI-аналіз, з графіком по тижнях/місяцях, динамікою та прогнозом на місяць",
    ],
  },
  {
    version: "v2.0",
    date: "01.07.2026",
    items: [
      "**Інтеграція з Google Drive / Google Meet** — автоматичне виявлення нових записів зустрічей, транскрипція AssemblyAI з розпізнаванням спікерів (укр/рос), AI-аналіз за окремими критеріями для зустрічей",
      "**Відтворення записів зустрічей** через пряме посилання на Google Drive",
      "**Пояснення критеріїв оцінки простою мовою** під кожним пунктом розбору дзвінка/зустрічі",
      "**Підписи спікерів у транскрипції зустрічі** (реальні імена та ролі менеджер/клієнт) замість «Спікер A/B»",
      "**Можливість вказати декілька послуг на одну розмову** замість однієї",
      "**Виправлено: розмови з тегом «Не цільовий»** більше не занижують середній AI-бал на дашборді, картках менеджерів і списку розмов",
      "**У розкладі звітів додано тип «Зустрічі»**",
      "**Зменшено розмір сторінки в списку розмов** (20 → 12) для зручнішої пагінації",
      "**Перейменовано складні формулювання критеріїв оцінки** на простішу українську у всіх 3 промтах",
      "**Інсайти: розділ «По менеджерах» і цитати** тепер показують реальний текст AI (раніше — фейкові нулі)",
      "**Інсайти: перехід на надійний структурований формат відповіді Claude** — усунуто помилки «зламаного JSON»",
      "**Інсайти: реальна вартість кожного аналізу в доларах** поруч з датою, а не лише попередня оцінка",
      "**Інсайти: автоматичні графіки розподілу за частотою** (найпоширеніші заперечення, теми тощо)",
      "**Інсайти: перехід на модель Claude Sonnet 5**",
      "**Інсайти: PDF-експорт тепер включає розбір по менеджерах, цитати та графіки** (раніше були відсутні)",
      "**Налаштування → Доступи: посада тепер відображається і редагується** в списку користувачів",
      "**Налаштування → Доступи: додавати користувача можна лише за email** — ім'я автоматично підтягнеться з Google при першому вході",
      "**Додано цю сторінку «Що нового»**",
    ],
  },
  {
    version: "v1.0",
    date: "30.06.2026",
    items: [
      "**Перший реліз** — платформа для автоматичного AI-аналізу дзвінків менеджерів з продажу",
      "**Автовизначення послуги Inweb**, згаданої в дзвінку, з можливістю ручної корекції",
      "**Конкретні AI-рекомендації менеджеру після кожного дзвінка** + аудіозапис у картці розмови",
      "**Кнопка повторного аналізу** для проблемних записів",
      "**Дашборд: середній AI-бал команди, топ-менеджери, графіки активності та послуг**",
      "**Розмови: список з фільтрами та пагінацією**, картка з деталями аналізу",
      "**Команда: профілі з динамікою балів** по тижнях/місяцях",
      "**Інсайти: AI-аналіз довільних питань керівника** по всій команді за обраний період — структурований звіт з графіками, експорт у PDF",
      "**Коучинг: персональні плани розвитку**, програми навчання та нотатки PDP-зустрічей",
      "**Промти: гнучке налаштування критеріїв оцінки** під кожен тип дзвінка",
      "**Заплановані звіти: щотижневі й щомісячні сповіщення в Telegram**",
      "**Вхід лише через корпоративний Google-акаунт** (@inweb.ua), три рівні доступу — адмін/менеджер/співробітник",
      "**Claude Haiku 4.5 для масового аналізу дзвінків, Claude Sonnet 4.6 для Інсайтів**",
      "**Ребрендинг на HuyumiAI** — новий логотип, фіолетово-синя палітра",
    ],
  },
];

// Changelog items are plain strings, but a bare wall of same-weight text is hard to
// scan — wrapping the lead phrase in "**...**" (only where authored that way; older
// entries without it render unchanged) lets the headline of each point stand out
// without restructuring every past entry into a {title, detail} shape.
function renderChangelogItem(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1
    ? <strong key={i} className="font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{part}</strong>
    : part));
}

function ChangelogCard({ entry, defaultOpen }: { entry: { version: string; date: string; items: string[] }; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "bg-card border rounded-xl transition-all duration-150",
      open ? "border-primary/20 shadow-sm" : "border-border hover:border-primary/20"
    )}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-5 text-left">
        <span className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{entry.version}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            {entry.date !== "—" && <span>{entry.date}</span>}
            <span>·</span>
            <span>{entry.items.length} {entry.items.length === 1 ? "зміна" : "змін"}</span>
          </div>
        </div>

        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <ul className="space-y-1.5">
            {entry.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <BrandArrowRight className="w-3 h-3 text-accent shrink-0 mt-1" /> <span>{renderChangelogItem(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0].version;
export const CHANGELOG_SEEN_KEY = "lumi_changelog_seen_version";

export function ChangelogTab() {
  // Mark the latest version as seen as soon as the page is opened — clears the
  // "unread" dot in the footer without needing a round-trip to a server.
  useEffect(() => {
    save(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_VERSION);
  }, []);

  return (
    <div className="space-y-4">
      <Section title="Що нового" description="Історія версій HuyumiAI">
        <div className="space-y-3">
          {CHANGELOG.map((entry, i) => (
            <ChangelogCard key={entry.version} entry={entry} defaultOpen={i === 0} />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── AUDIT LOG TAB ─────────────────────────────────────────────────────────────
type AuditEntry = {
  kind: "access" | "prompt" | "activity"; action: string; summary: string;
  performed_by: string | null; created_at: string; href: string;
  versionId?: string; promptId?: string;
};

const AUDIT_ICON: Record<AuditEntry["kind"], { bg: string; color: string }> = {
  access: { bg: "bg-amber-50 dark:bg-amber-500/10", color: "text-amber-600 dark:text-amber-400" },
  prompt: { bg: "bg-primary/8", color: "text-primary" },
  activity: { bg: "bg-sky-50 dark:bg-sky-500/10", color: "text-sky-600 dark:text-sky-400" },
};

// Renders a word-diff inline: removed words struck through in red, added words
// underlined in green, unchanged words plain — so a one-word typo fix reads as
// exactly that, not as "the whole prompt changed".
function PromptDiffView({ versionId }: { versionId: string }) {
  const [diff, setDiff] = useState<{ before: string; after: string } | "loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audit-log/prompt-diff?versionId=${versionId}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDiff(data.error ? "error" : data); })
      .catch(() => { if (!cancelled) setDiff("error"); });
    return () => { cancelled = true; };
  }, [versionId]);

  if (diff === "loading") return <p className="text-xs text-muted-foreground py-3">Завантаження diff…</p>;
  if (diff === "error") return <p className="text-xs text-red-500 py-3">Не вдалося завантажити зміни.</p>;

  const tokens = wordDiff(diff.before, diff.after);
  const changed = tokens.some(t => t.type !== "same");

  if (!changed) {
    return <p className="text-xs text-muted-foreground py-3">Текст не змінився (можливо, змінилась лише назва чи доступ).</p>;
  }

  return (
    <div className="mt-2 mb-3 rounded-lg border border-border bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      {tokens.map((t, i) => t.type === "same"
        ? <span key={i} className="text-foreground/70">{t.text}</span>
        : t.type === "del"
        ? <span key={i} className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 line-through decoration-red-400">{t.text}</span>
        : <span key={i} className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 underline decoration-emerald-400">{t.text}</span>
      )}
    </div>
  );
}

// Coarser bucket than the raw kind/action — "activity" alone mixes contragent
// merges, deal-integrity autofixes, and everything else into one undifferentiated
// pile, which is exactly what made "who changed what in a prompt" slow to find by
// scrolling. Buckets map 1:1 to the filter tabs below.
type AuditCategory = "prompt" | "access" | "contragent" | "system";
function categoryOf(e: AuditEntry): AuditCategory {
  if (e.kind === "prompt") return "prompt";
  if (e.kind === "access") return "access";
  if (e.action.startsWith("contragent_")) return "contragent";
  return "system";
}
const CATEGORY_TABS: { value: AuditCategory | ""; label: string }[] = [
  { value: "",           label: "Всі" },
  { value: "prompt",     label: "Промти" },
  { value: "access",     label: "Доступи" },
  { value: "contragent", label: "Контрагенти" },
  { value: "system",     label: "Система" },
];
const AUDIT_PAGE_SIZE = 20;

export function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/audit-log")
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]));
  }, []);

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const filtered = (entries ?? []).filter(e => !category || categoryOf(e) === category);
  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Section title="Журнал змін" description="Хто і коли редагував промти чи змінював доступ користувачів">
        {entries !== null && entries.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {CATEGORY_TABS.map(tab => (
              <button key={tab.value || "all"}
                onClick={() => { setCategory(tab.value); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  category === tab.value ? "bg-accent text-white" : "bg-secondary/60 text-muted-foreground hover:text-primary")}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {tab.label}
                {tab.value && <span className="ml-1 opacity-70">{entries.filter(e => categoryOf(e) === tab.value).length}</span>}
              </button>
            ))}
          </div>
        )}
        {entries === null ? (
          <p className="text-sm text-muted-foreground text-center py-12">Завантаження…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Ще немає записів — журнал заповнюється з наступної правки промту чи доступу.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Немає записів у цій категорії.</p>
        ) : (
          <div className="divide-y divide-border">
            {paged.map((e, i) => {
              const icon = AUDIT_ICON[e.kind];
              const canExpand = e.kind === "prompt" && !!e.versionId;
              const key = e.versionId ?? String(i);
              const isOpen = expanded.has(key);

              const row = (
                <div className="flex items-start gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-secondary/50 transition-colors group">
                  <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", icon.bg, icon.color)}>
                    {e.kind === "access" ? <Users className="w-4 h-4" /> : e.kind === "prompt" ? <FileText className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground group-hover:text-primary transition-colors">{e.summary}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.performed_by ?? "Невідомо"} · {new Date(e.created_at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {canExpand && isOpen && <PromptDiffView versionId={e.versionId!} />}
                  </div>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-transform shrink-0 mt-2",
                    canExpand ? (isOpen ? "rotate-0" : "-rotate-90") : "-rotate-90")} />
                </div>
              );

              return canExpand ? (
                <button key={i} onClick={() => toggle(key)} className="w-full text-left">{row}</button>
              ) : (
                <Link key={i} href={e.href} className="block">{row}</Link>
              );
            })}
          </div>
        )}
        {filtered.length > AUDIT_PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            <span>Показано {(page - 1) * AUDIT_PAGE_SIZE + 1}–{Math.min(page * AUDIT_PAGE_SIZE, filtered.length)} з {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2.5 py-1 rounded-md border border-border disabled:opacity-30 hover:bg-secondary/60 transition-colors">
                Назад
              </button>
              <span className="px-2 font-semibold text-foreground">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2.5 py-1 rounded-md border border-border disabled:opacity-30 hover:bg-secondary/60 transition-colors">
                Далі
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── COSTS TAB ─────────────────────────────────────────────────────────────────
type CostPoint = { key: string; analysis: number; insights: number; transcription: number; reports: number; total: number };
type CostsData = {
  daily: CostPoint[]; weekly: CostPoint[]; monthly: CostPoint[];
  thisMonthTotal: number; thisWeekTotal: number;
  lastWeekTotal: number; lastMonthTotal: number;
  projectedMonthTotal: number;
};

const COST_SEGMENTS = [
  { field: "analysis" as const,      label: "AI-аналіз дзвінків/зустрічей", service: "Claude API (Anthropic)", exact: true,  color: "#003B29" },
  { field: "insights" as const,      label: "Інсайти",                      service: "Claude API (Anthropic)", exact: true,  color: "#EF583D" },
  { field: "reports" as const,       label: "AI-висновок у Telegram-звіті", service: "Claude API (Anthropic)", exact: true,  color: "#10B981" },
  { field: "transcription" as const, label: "Транскрипція зустрічей",       service: "AssemblyAI",             exact: false, color: "#F59E0B" },
];

function fmtUsd(n: number): string {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}

function deltaBadge(cur: number, prev: number): { text: string; className: string } | null {
  if (prev <= 0) return null;
  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  if (pct === 0) return null;
  return diff > 0
    ? { text: `▲ ${pct}%`, className: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10" }
    : { text: `▼ ${Math.abs(pct)}%`, className: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" };
}

function CostBarChart({ data, periodLabel }: { data: CostPoint[]; periodLabel: (key: string) => string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">Ще немає даних про витрати за цей період</p>;
  }
  const maxVal = Math.max(...data.map(d => d.total), 0.01);
  const W = 900, H = 240, PL = 40, PR = 8, PT = 16, PB = 28;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const groupW = chartW / data.length;
  const barW = Math.max(10, Math.min(36, groupW * 0.5));
  const toY = (v: number) => PT + (1 - v / maxVal) * chartH;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => maxVal * f);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {gridVals.map(v => (
          <g key={v}>
            <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#F3F4F6" strokeWidth="1" />
            <text x={PL - 6} y={toY(v) + 4} fontSize="10" fill="#6B7280" textAnchor="end" fontFamily="var(--font-geist-sans), sans-serif">
              ${v.toFixed(2)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PL + i * groupW + (groupW - barW) / 2;
          let yCursor = d.total;
          return (
            <g key={d.key}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {COST_SEGMENTS.map(seg => {
                const val = d[seg.field];
                if (val <= 0) return null;
                const yTop = toY(yCursor);
                yCursor -= val;
                const h = Math.max((val / maxVal) * chartH, 1.5);
                return (
                  <rect key={seg.field} x={x} y={yTop} width={barW} height={h}
                    fill={seg.color} opacity={hovered === i ? 1 : 0.85} className="transition-opacity" />
                );
              })}
              {/* transparent full-height hit target so hovering the gap between segments still works */}
              <rect x={x} y={PT} width={barW} height={chartH} fill="transparent" />
              <text x={x + barW / 2} y={H - PB + 16} fontSize="10" fill="#6B7280" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif">
                {periodLabel(d.key)}
              </text>
            </g>
          );
        })}
      </svg>
      {hovered !== null && (() => {
        // Position the tooltip next to the actual hovered bar (in % of chart width,
        // since the SVG scales via viewBox) instead of always pinning it top-right —
        // anchor from the right on bars past the midpoint so it never overflows.
        const barX = PL + hovered * groupW + (groupW - barW) / 2;
        const barCenterPct = ((barX + barW / 2) / W) * 100;
        // Default to opening rightward (natural reading direction) — only flip to the
        // left when the bar is close enough to the right edge that the tooltip (min-width
        // 180px, roughly 20% of this chart's 900-unit viewBox) would actually overflow.
        const onRightHalf = barCenterPct > 78;
        const posStyle = onRightHalf
          ? { right: `${100 - barCenterPct}%` }
          : { left: `${barCenterPct}%` };
        return (
        <div className="absolute top-0 bg-[#1C1C1C] text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none min-w-[180px]"
          style={{ fontFamily: "var(--font-geist-sans), sans-serif", ...posStyle }}>
          <p className="font-bold mb-1.5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{periodLabel(data[hovered].key)}</p>
          {COST_SEGMENTS.map(seg => (
            <div key={seg.field} className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="flex-1">{seg.label}</span>
              <span className="font-semibold">{fmtUsd(data[hovered][seg.field])}</span>
            </div>
          ))}
          <p className="font-bold mt-1.5 pt-1.5 border-t border-white/20 flex justify-between">
            <span>Разом</span><span>{fmtUsd(data[hovered].total)}</span>
          </p>
        </div>
        );
      })()}
    </div>
  );
}

const WINDOW_SIZE: Record<"daily" | "weekly" | "monthly", number> = { daily: 14, weekly: 8, monthly: 6 };

export function CostsTab() {
  const [data, setData] = useState<CostsData | null>(null);
  const [view, setView] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [offset, setOffset] = useState(0); // periods back from the most recent window, in window-sized steps

  useEffect(() => {
    fetch("/api/costs", { cache: "no-store" }).then(r => r.json()).then(setData).catch(() => {});
  }, []);

  function changeView(v: "daily" | "weekly" | "monthly") {
    setView(v);
    setOffset(0);
  }

  const dayLabel = (key: string) => {
    const [y, m, d] = key.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  };
  const weekLabel = (key: string) => key.split("-W")[1] ? `Тиж ${Number(key.split("-W")[1])}` : key;
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("uk-UA", { month: "short" });
  };

  const weekDelta = data ? deltaBadge(data.thisWeekTotal, data.lastWeekTotal) : null;
  const monthDelta = data ? deltaBadge(data.thisMonthTotal, data.lastMonthTotal) : null;

  return (
    <div className="space-y-4">
      <Section title="Витрати на AI" description="Скільки коштує AI-аналіз дзвінків, зустрічей та Інсайтів">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-muted border border-border rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Цього тижня</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {data ? fmtUsd(data.thisWeekTotal) : "—"}
              </p>
              {weekDelta && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", weekDelta.className)}>{weekDelta.text}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">vs тиждень тому</p>
          </div>
          <div className="p-4 bg-muted border border-border rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Цього місяця</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-black text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {data ? fmtUsd(data.thisMonthTotal) : "—"}
              </p>
              {monthDelta && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", monthDelta.className)}>{monthDelta.text}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">vs місяць тому</p>
          </div>
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Прогноз на місяць</p>
            <p className="text-2xl font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {data ? fmtUsd(data.projectedMonthTotal) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">за поточним темпом</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 w-fit">
            {([["daily", "По днях"], ["weekly", "По тижнях"], ["monthly", "По місяцях"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => changeView(val)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md transition-colors font-medium",
                  view === val ? "bg-accent text-white font-bold shadow-sm" : "text-muted-foreground hover:text-primary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
          {(() => {
            const full = data ? (view === "daily" ? data.daily : view === "weekly" ? data.weekly : data.monthly) : [];
            const windowSize = WINDOW_SIZE[view];
            const maxOffset = Math.max(0, Math.ceil(full.length / windowSize) - 1);
            return (
              <div className="flex items-center gap-1">
                <button onClick={() => setOffset(o => Math.min(o + 1, maxOffset))} disabled={offset >= maxOffset}
                  className="px-2 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors">
                  ← Раніше
                </button>
                <button onClick={() => setOffset(o => Math.max(o - 1, 0))} disabled={offset === 0}
                  className="px-2 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors">
                  Пізніше →
                </button>
              </div>
            );
          })()}
        </div>

        {data ? (() => {
          const full = view === "daily" ? data.daily : view === "weekly" ? data.weekly : data.monthly;
          const windowSize = WINDOW_SIZE[view];
          const end = full.length - offset * windowSize;
          const visible = full.slice(Math.max(0, end - windowSize), end);
          return (
            <CostBarChart
              data={visible}
              periodLabel={view === "daily" ? dayLabel : view === "weekly" ? weekLabel : monthLabel}
            />
          );
        })() : (
          <p className="text-sm text-muted-foreground text-center py-12">Завантаження…</p>
        )}

        <div className="mt-5 pt-4 border-t border-border space-y-2">
          <p className="text-xs font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Звідки береться вартість</p>
          {COST_SEGMENTS.map(seg => (
            <div key={seg.field} className="flex items-center gap-2 text-xs text-foreground/80">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="font-medium">{seg.label}</span>
              <span className="text-muted-foreground">— {seg.service}</span>
              <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded",
                seg.exact ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                {seg.exact ? "точна вартість" : "орієнтовна оцінка"}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">
            AI-аналіз та Інсайти рахуються за фактичною кількістю токенів, які повертає Claude API — це реальна вартість. Транскрипція зустрічей — оцінка за тривалістю запису та публічним тарифом AssemblyAI, оскільки точних даних по кожному запиту в нас немає.
          </p>

          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-foreground mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тариф Claude API (Sonnet 5)</p>
              <p className="text-[11px] text-muted-foreground">$2 / 1M токенів на вході</p>
              <p className="text-[11px] text-muted-foreground">$10 / 1M токенів на виході</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-foreground mb-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тариф AssemblyAI</p>
              <p className="text-[11px] text-muted-foreground">~$0.17 / година транскрипції (Universal-2 + розпізнавання спікерів, за фактичним використанням акаунту)</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
