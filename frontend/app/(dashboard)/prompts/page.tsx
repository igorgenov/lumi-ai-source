"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";
import { BrandCheck } from "@/components/icons/brand-icons";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import { useManagers } from "@/hooks/useManagers";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Plus, FileText, Trash2, ToggleLeft, ToggleRight, Pencil,
  ChevronDown, X, Save, Eye, EyeOff, AlertCircle, Loader2, Lock, History,
} from "lucide-react";

interface Prompt {
  id: string;
  name: string;
  description: string;
  text: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  usage_count: number;
  conversation_type: "all" | "call" | "meeting" | "chat";
  manager_roles: string[];
}

const CONV_TYPE_LABELS: Record<string, string> = { all: "Всі розмови", call: "Дзвінки", meeting: "Зустрічі", chat: "Telegram-чати" };
const CONV_TYPE_COLORS: Record<string, string> = {
  all: "bg-secondary text-muted-foreground border-border",
  call: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30",
  meeting: "bg-accent/10 text-accent-strong border-accent/25",
  chat: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
};
interface ManagerOption { id: string; name: string; avatar_url?: string | null }

const SEED_PROMPTS = [
  {
    name: "Inweb / Оцінка дзвінка брифа LQS з клієнтом",
    description: "Аналіз дзвінків спеціалістів з кваліфікації лідів (LQS). Оцінює виявлення потреб, BANT-критерії та передачу в роботу.",
    text: `Ти — експерт з аналізу продажів у digital-агентстві Inweb. Проаналізуй транскрипт дзвінка брифа менеджера LQS з клієнтом та надай структурований зворотній зв'язок.

Оціни розмову за шкалою від 0 до 100 та визнач:

1. **Виявлення потреб** (0–25 балів)
   - Чи з'ясував менеджер бізнес-цілі клієнта?
   - Чи запитав про поточну ситуацію та болі?
   - Чи визначив пріоритети клієнта?

2. **BANT-кваліфікація** (0–25 балів)
   - Budget: чи обговорювався бюджет?
   - Authority: чи спілкується менеджер з особою, що приймає рішення?
   - Need: чи підтверджена реальна потреба?
   - Timeline: чи визначені терміни?

3. **Презентація цінності** (0–25 балів)
   - Чи пов'язав менеджер рішення Inweb з потребою клієнта?
   - Чи використовував конкретні приклади або кейси?

4. **Наступний крок** (0–25 балів)
   - Чи зафіксовано чіткий наступний крок?
   - Чи призначено зустріч або надіслано КП?

Надай відповідь у форматі JSON з полями: score (число 0–100), summary (рядок), strengths (масив рядків), weaknesses (масив рядків), recommendations (масив рядків), sentiment ("positive" | "neutral" | "negative").`,
    active: true,
  },
  {
    name: "Inweb / Оцінка дзвінка добрифування SM з клієнтом",
    description: "Аналіз дзвінків добрифування Sales Manager. Акцент на відпрацюванні заперечень, техніках закриття та управлінні угодою.",
    text: `Ти — старший тренер з продажів у digital-агентстві Inweb. Проаналізуй транскрипт дзвінка добрифування Sales Manager з клієнтом та надай детальний зворотній зв'язок.

Оціни розмову за шкалою від 0 до 100 за такими критеріями:

1. **Відпрацювання заперечень** (0–30 балів)
   - Чи визнав менеджер заперечення клієнта?
   - Чи використовував техніки Feel-Felt-Found або аналогічні?
   - Чи підкріпив відповідь фактами, кейсами або ROI?
   - Чи не погоджувався з ціновим запереченням одразу?

2. **Управління розмовою** (0–25 балів)
   - Чи тримав менеджер ініціативу в розмові?
   - Чи не було надмірних пауз (>15 сек)?
   - Чи був структурований діалог?

3. **Презентація рішення** (0–25 балів)
   - Чи запропоновано конкретне рішення під потреби клієнта?
   - Чи розраховано потенційний ROI або результат?
   - Чи наведено релевантні кейси з тієї ж галузі?

4. **Закриття** (0–20 балів)
   - Чи була спроба закрити угоду або отримати commitment?
   - Чи запропоновано альтернативи (пілот, знижка, поетапний старт)?
   - Чи зафіксовано дедлайн для рішення клієнта?

Надай відповідь у форматі JSON з полями: score (число 0–100), summary (рядок), strengths (масив рядків), weaknesses (масив рядків), recommendations (масив рядків), sentiment ("positive" | "neutral" | "negative"), talkRatio (рядок "менеджер X% / клієнт Y%"), objectionHandling (число 0–100), needsIdentification (число 0–100), closingSkills (число 0–100).`,
    active: true,
  },
  {
    name: "Inweb / Чек лист №3 по ENIQ АІ / Оцінка презентації КП SM з клієнтом",
    description: "Аналіз презентації комерційної пропозиції Sales Manager клієнту. Оцінює структуру презентації, роботу з цінністю та отримання commitment.",
    text: `Ти — експерт з продажів у digital-агентстві Inweb (методологія ENIQ AI). Проаналізуй транскрипт презентації комерційної пропозиції Sales Manager клієнту та надай зворотній зв'язок згідно Чек-листу №3.

Оціни презентацію за шкалою від 0 до 100 за такими критеріями:

1. **Підготовка та структура** (0–20 балів)
   - Чи підготував менеджер персоналізовану КП під потреби клієнта?
   - Чи чітка структура: резюме → рішення → результат → ціна → наступний крок?
   - Чи зробив короткий recap потреб клієнта на початку?

2. **Презентація цінності** (0–30 балів)
   - Чи пов'язав кожен елемент КП з конкретним болем клієнта?
   - Чи навів ROI або очікуваний результат у цифрах?
   - Чи використав кейси з аналогічної ніші або бізнесу?
   - Чи уникав технічного жаргону, незрозумілого клієнту?

3. **Робота з ціною** (0–25 балів)
   - Чи озвучив ціну впевнено (без вибачень)?
   - Чи пояснив з чого складається вартість?
   - Чи порівняв вартість з результатом (не з витратами)?
   - Чи запропонував варіанти (пакети/поетапний старт), якщо клієнт коливається?

4. **Отримання commitment** (0–25 балів)
   - Чи запитав про враження клієнта після презентації?
   - Чи відпрацював заперечення, що виникли під час презентації?
   - Чи зафіксовано чіткий наступний крок із конкретною датою?
   - Чи отримано verbальний або письмовий commitment?

Надай відповідь у форматі JSON з полями: score (число 0–100), summary (рядок), strengths (масив рядків), weaknesses (масив рядків), recommendations (масив рядків), sentiment ("positive" | "neutral" | "negative"), valuePresentation (число 0–100), priceHandling (число 0–100), commitmentReceived (true | false).`,
    active: true,
  },
];

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  prompt: Partial<Prompt> | null;
  onSave: (p: Prompt) => void;
  onClose: () => void;
  managers: ManagerOption[];
  canEdit: boolean;
}

function PromptModal({ prompt, onSave, onClose, managers, canEdit }: ModalProps) {
  const isNew = !prompt?.id;
  const [mode, setMode]                   = useState<"view" | "edit">(isNew ? "edit" : "view");
  const [name, setName]                   = useState(prompt?.name ?? "");
  const [description, setDescription]     = useState(prompt?.description ?? "");
  const [text, setText]                   = useState(prompt?.text ?? "");
  const [convType, setConvType]           = useState<"all"|"call"|"meeting"|"chat">(prompt?.conversation_type ?? "all");
  const [roles, setRoles]                 = useState<string[]>(prompt?.manager_roles ?? []);
  const [preview, setPreview]             = useState(false);
  const [error, setError]                 = useState("");
  const [saving, setSaving]               = useState(false);

  // Reset local form state whenever a different prompt is selected — otherwise it
  // stays stale from whichever prompt was last edited (both this and the mode reset
  // live here rather than in a useEffect, since prompt?.id is what actually varies).
  const [loadedId, setLoadedId] = useState(prompt?.id);
  if (prompt?.id !== loadedId) {
    setLoadedId(prompt?.id);
    setMode(isNew ? "edit" : "view");
    setName(prompt?.name ?? "");
    setDescription(prompt?.description ?? "");
    setText(prompt?.text ?? "");
    setConvType(prompt?.conversation_type ?? "all");
    setRoles(prompt?.manager_roles ?? []);
    setError("");
  }

  function toggleRole(role: string) {
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Введіть назву промту"); return; }
    if (!text.trim()) { setError("Текст промту не може бути порожнім"); return; }
    setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/prompts" : `/api/prompts/${prompt!.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), description: description.trim(), text: text.trim(),
          active: prompt?.active ?? true,
          conversation_type: convType,
          manager_roles: roles,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: Prompt = await res.json();
      onSave(saved);
      setMode("view");
    } catch (e: any) {
      setError(e.message ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-black text-foreground truncate" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {isNew ? "Новий промт" : (prompt?.name || "Промт")}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {mode === "view" ? (
              canEdit && (
                <button onClick={() => setMode("edit")}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-primary/30 text-primary rounded-lg hover:bg-primary/5 transition-colors"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  <Pencil className="w-3.5 h-3.5" /> Редагувати
                </button>
              )
            ) : (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-60"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isNew ? "Створити" : "Зберегти"}
              </button>
            )}
            <button onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {mode === "view" ? (
          <>
            {prompt?.description && (
              <p className="text-sm text-muted-foreground">{prompt.description}</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", CONV_TYPE_COLORS[prompt?.conversation_type ?? "all"])}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {CONV_TYPE_LABELS[prompt?.conversation_type ?? "all"]}
              </span>
              {(prompt?.manager_roles ?? []).length > 0
                ? (prompt?.manager_roles ?? []).map(id => {
                    const mgr = managers.find(m => m.id === id);
                    return (
                      <span key={id} className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-primary/8 text-primary border-primary/20"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr ? mgr.name.split(" ")[0] : id}</span>
                    );
                  })
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-secondary text-muted-foreground border-border"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Всі менеджери</span>
              }
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Текст промту</p>
              <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                {prompt?.text}
              </pre>
            </div>
          </>
        ) : (
          <>
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Назва промту *
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              placeholder="напр. Inweb / Оцінка дзвінка брифа LQS"
              className={cn(
                "w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40",
                error && !name.trim() ? "border-red-400" : "border-border"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Короткий опис
            </label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Для чого цей промт, які розмови аналізує?"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 bg-card text-foreground"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            />
          </div>

          {/* Тип розмови + Команда */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Тип розмови</label>
              <div className="flex gap-1.5">
                {(["all","call","meeting","chat"] as const).map(t => (
                  <button key={t} onClick={() => setConvType(t)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                      convType === t ? "bg-accent text-white border-accent" : "bg-card text-muted-foreground border-border hover:border-primary/30"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    {t === "all" ? "Всі" : t === "call" ? "Дзвінки" : t === "meeting" ? "Зустрічі" : "Чати"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Команда</label>
              {managers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Завантаження...</p>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setRoles([])}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg border transition-colors text-left",
                      roles.length === 0 ? "bg-accent text-white border-accent" : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-primary"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", roles.length === 0 ? "bg-card/30 border-white/50" : "border-border")}>
                      {roles.length === 0 && <BrandCheck className="w-3 h-3 text-white" />}
                    </div>
                    Всі менеджери
                  </button>
                  {managers.map(m => {
                    const sel = roles.includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleRole(m.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg border transition-colors text-left",
                          sel ? "bg-primary/8 text-primary border-primary/20 font-semibold" : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-primary"
                        )}
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", sel ? "bg-primary border-primary" : "border-border")}>
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
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                Текст промту *
              </label>
              <button
                onClick={() => setPreview(v => !v)}
                className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {preview ? <><EyeOff className="w-3.5 h-3.5" /> Редагувати</> : <><Eye className="w-3.5 h-3.5" /> Попередній перегляд</>}
              </button>
            </div>

            {preview ? (
              <div className="w-full min-h-[240px] text-sm border border-border rounded-lg px-4 py-3 bg-secondary/30
                whitespace-pre-wrap leading-relaxed text-foreground overflow-y-auto"
                style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                {text || <span className="text-muted-foreground italic">Промт порожній</span>}
              </div>
            ) : (
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); setError(""); }}
                rows={12}
                placeholder="Введіть системний промт для AI-аналізу розмов..."
                className={cn(
                  "w-full text-sm border rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 leading-relaxed",
                  error && !text.trim() ? "border-red-400" : "border-border"
                )}
                style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
              />
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              {text.length} символів · {text.split(/\s+/).filter(Boolean).length} слів
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          </>
        )}
        </div>

        {!isNew && (
          <div className="px-6 py-3 border-t border-border shrink-0 bg-secondary/60 text-xs text-muted-foreground">
            Змінено востаннє: {prompt?.updated_at?.slice(0, 10) ?? "—"}
          </div>
        )}
    </div>
  );
}

// ── Prompt card ───────────────────────────────────────────────────────────────
interface PromptVersion {
  id: number;
  name: string;
  description: string | null;
  text: string;
  conversation_type: string | null;
  manager_roles: string[] | null;
  edited_by: string | null;
  created_at: string;
}

interface CardProps {
  prompt: Prompt;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRestored: (updated: Prompt) => void;
  managers: ManagerOption[];
  canEdit: boolean;
  isSelected?: boolean;
}

function PromptCard({ prompt, onEdit, onDelete, onToggle, onRestored, managers, canEdit, isSelected }: CardProps) {
  const confirm = useConfirm();
  const [expanded, setExpanded]     = useState(false);
  const [confirmDelete, setConfirm] = useState(false);
  const [historyOpen, setHistoryOpen]       = useState(false);
  const [versions, setVersions]             = useState<PromptVersion[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);
  const [restoringId, setRestoringId]       = useState<number | null>(null);

  async function handleToggleClick() {
    if (prompt.active) {
      const ok = await confirm({
        title: "Вимкнути промт?",
        description: `«${prompt.name}» більше не застосовуватиметься при автоматичному AI-аналізі розмов, поки не увімкнеш його знову.`,
        confirmLabel: "Вимкнути",
        danger: true,
      });
      if (!ok) return;
    }
    onToggle();
  }

  function toggleHistory() {
    setHistoryOpen(v => !v);
    if (!versions && !versionsLoading) {
      setVersionsLoading(true);
      fetch(`/api/prompts/${prompt.id}/versions`)
        .then(r => r.json())
        .then(data => setVersions(Array.isArray(data) ? data : []))
        .catch(() => setVersions([]))
        .finally(() => setVersionsLoading(false));
    }
  }

  async function restoreVersion(versionId: number) {
    setRestoringId(versionId);
    try {
      const res = await fetch(`/api/prompts/${prompt.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) {
        const updated: Prompt = await res.json();
        onRestored(updated);
        setVersions(null); // force refetch next time it's opened, so the new pre-restore snapshot shows up
        setHistoryOpen(false);
      }
    } finally {
      setRestoringId(null);
      setConfirmRestoreId(null);
    }
  }

  return (
    <div className={cn(
      "bg-card border rounded-xl transition-all duration-150 cursor-pointer",
      isSelected ? "border-primary ring-1 ring-primary/20 bg-primary/[0.03]" : prompt.active ? "border-border hover:border-primary/20" : "border-dashed border-border opacity-60"
    )} onClick={onEdit}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-black text-foreground leading-snug" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {prompt.name}
          </h3>
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 mt-0.5",
            prompt.active
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-primary-hover border-emerald-200 dark:border-emerald-500/30"
              : "bg-secondary text-muted-foreground border-border"
          )} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            {prompt.active ? "Активний" : "Вимкнено"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {CONV_TYPE_LABELS[prompt.conversation_type ?? "all"]}
        </p>

        {isSelected && (
        <div className="flex items-center gap-1.5 mt-3 flex-wrap" onClick={e => e.stopPropagation()}>
              {(prompt.manager_roles ?? []).length > 0
                ? (prompt.manager_roles ?? []).map(id => {
                    const mgr = managers.find(m => m.id === id);
                    const label = mgr ? mgr.name.split(" ")[0] : id;
                    return (
                      <span key={id} className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-primary/8 text-primary border-primary/20"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{label}</span>
                    );
                  })
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-secondary text-muted-foreground border-border"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Всі менеджери</span>
              }
        </div>
        )}

        {isSelected && (
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
            {canEdit && (
              <>
                <button onClick={toggleHistory} title="Історія версій"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg border border-border bg-card hover:border-primary/30 hover:text-primary transition-colors"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  <History className="w-3 h-3" /> Історія
                </button>
                <button onClick={handleToggleClick} title={prompt.active ? "Вимкнути" : "Увімкнути"}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors">
                  {prompt.active
                    ? <ToggleRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    : <ToggleLeft className="w-4 h-4" />
                  }
                </button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-[10px] text-red-500 font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Видалити?</span>
                    <button onClick={onDelete}
                      className="px-2 py-1 text-[10px] font-bold bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Так</button>
                    <button onClick={() => setConfirm(false)}
                      className="px-2 py-1 text-[10px] font-bold border border-border rounded-md text-muted-foreground hover:text-primary bg-card transition-colors"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ні</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirm(true)} title="Видалити"
                    className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
        </div>
        )}
      </div>

      {expanded && (
        <div className="px-5 pb-5">
          <div className="bg-secondary border border-border rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-foreground mb-2 uppercase tracking-wider"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Текст промту</p>
            <pre className="text-xs text-foreground leading-relaxed whitespace-pre-wrap"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              {prompt.text}
            </pre>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="px-5 pb-5">
          <div className="border border-border rounded-xl divide-y divide-border">
            <p className="text-[11px] font-bold text-foreground px-4 py-2.5 uppercase tracking-wider bg-muted"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Історія версій</p>
            {versionsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : !versions || versions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-4">Ще немає збережених версій — вони з'являються після першої правки промту.</p>
            ) : (
              versions.map(v => (
                <div key={v.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                      {new Date(v.created_at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {v.edited_by && <> · {v.edited_by}</>}
                    </span>
                    {confirmRestoreId === v.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Замінити поточний текст цією версією?</span>
                        <button onClick={() => restoreVersion(v.id)} disabled={restoringId === v.id}
                          className="px-2 py-1 text-[10px] font-bold bg-primary text-white rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                          {restoringId === v.id ? "Відновлюємо…" : "Так, відновити"}
                        </button>
                        <button onClick={() => setConfirmRestoreId(null)}
                          className="px-2 py-1 text-[10px] font-bold border border-border rounded-md text-muted-foreground hover:text-primary bg-card transition-colors"
                          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Ні</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRestoreId(v.id)}
                        className="text-[10px] font-bold px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/30 bg-card transition-colors"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                        Відновити цю версію
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                    {v.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PromptsPage() {
  const { data: session } = useSession();
  const role = useEffectiveRole();
  const canEdit = role === "owner" || role === "admin";
  const { managers: rawManagers } = useManagers();
  const managers: ManagerOption[] = rawManagers.filter(m => m.role === "pm").map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }));
  const [prompts, setPrompts]         = useState<Prompt[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalPrompt, setModalPrompt] = useState<Partial<Prompt> | null>(null);
  const [modalOpen, setModalOpen]     = useState(false);
  async function fetchPrompts() {
    const res = await fetch("/api/prompts");
    if (res.ok) setPrompts(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchPrompts(); }, []);

  function openCreate() { setModalPrompt({}); setModalOpen(true); }
  function openEdit(p: Prompt) { setModalPrompt(p); setModalOpen(true); }

  function handleSave(saved: Prompt) {
    setPrompts(prev => {
      const exists = prev.find(x => x.id === saved.id);
      return exists ? prev.map(x => x.id === saved.id ? saved : x) : [saved, ...prev];
    });
    setModalPrompt(saved);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    setPrompts(prev => prev.filter(p => p.id !== id));
  }

  async function handleToggle(p: Prompt) {
    const res = await fetch(`/api/prompts/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    if (res.ok) {
      const updated: Prompt = await res.json();
      setPrompts(prev => prev.map(x => x.id === updated.id ? updated : x));
    }
  }

  async function handleDuplicate(p: Prompt) {
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${p.name} (копія)`,
        description: p.description,
        text: p.text,
        active: false,
      }),
    });
    if (res.ok) {
      const copy: Prompt = await res.json();
      setPrompts(prev => [...prev, copy]);
    }
  }

  const activeCount = prompts.filter(p => p.active).length;

  useEffect(() => {
    if (!loading && prompts.length > 0 && !modalOpen) {
      setModalPrompt(prompts[0]);
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, prompts.length]);

  return (
    <div>
      <Header title="Промти" subtitle="Системні промти для AI-аналізу розмов" />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <div className="space-y-5">

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            {loading ? "Завантаження..." : (
              <>
                Всього: <span className="font-bold text-primary">{prompts.length}</span>
                <span className="mx-2">·</span>
                Активних: <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>
                {prompts.length - activeCount > 0 && (
                  <>
                    <span className="mx-2">·</span>
                    Вимкнено: <span className="font-bold text-muted-foreground">{prompts.length - activeCount}</span>
                  </>
                )}
              </>
            )}
          </div>

          {canEdit && prompts.length > 0 && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              <Plus className="w-4 h-4" />
              Створити промт
            </button>
          )}
        </div>

        {canEdit ? (
          <div className="bg-secondary border border-border rounded-xl px-4 py-3 flex items-start gap-3">
            <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Промти визначають, як AI аналізує розмови менеджерів. Кожен активний промт буде застосовуватись
              при автоматичному аналізі дзвінків та зустрічей. Зміни набирають чинності для нових аналізів.
            </p>
          </div>
        ) : (
          <div className="bg-secondary border border-border rounded-xl px-4 py-3 flex items-start gap-3">
            <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Тут можна переглянути, за якими критеріями AI оцінює твої розмови. Редагувати промти може лише власник або адміністратор.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
          </div>
        ) : prompts.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl py-20 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <FileText className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-bold text-muted-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Промтів ще немає
            </p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              {canEdit ? "Створіть перший промт для AI-аналізу розмов менеджерів" : "Адміністратор ще не додав жодного промту"}
            </p>
            {canEdit && (
              <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors mt-2"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <Plus className="w-3.5 h-3.5" /> Створити промт
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {prompts.map(p => (
              <PromptCard
                key={p.id}
                prompt={p}
                managers={managers}
                canEdit={canEdit}
                isSelected={modalOpen && modalPrompt?.id === p.id}
                onEdit={() => openEdit(p)}
                onDelete={() => handleDelete(p.id)}
                onToggle={() => handleToggle(p)}
                onRestored={updated => setPrompts(prev => prev.map(x => x.id === updated.id ? updated : x))}
              />
            ))}
          </div>
        )}
        </div>

        {modalOpen ? (
          <PromptModal
            prompt={modalPrompt}
            managers={managers}
            onSave={handleSave}
            onClose={() => setModalOpen(false)}
            canEdit={canEdit}
          />
        ) : (
          <div className="hidden lg:flex bg-card border border-dashed border-border rounded-xl h-64 items-center justify-center text-center px-6">
            <p className="text-sm text-muted-foreground">Оберіть промт зліва, щоб переглянути або відредагувати його</p>
          </div>
        )}
      </div>
    </div>
  );
}
