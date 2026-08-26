"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, CheckCircle2, AlertTriangle, Clock, BarChart2, X, Check, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTheme } from "@/components/theme-provider";

interface Notification {
  id: string;
  type: "analyzed" | "low_score" | "stuck" | "report";
  title: string;
  body: string;
  href?: string;
  read: boolean;
  created_at: string;
}

const NOTIF_ICON = {
  analyzed:  { icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-500/10", color: "text-emerald-600 dark:text-emerald-400" },
  low_score: { icon: AlertTriangle, bg: "bg-red-50 dark:bg-red-500/10",        color: "text-red-500 dark:text-red-400" },
  stuck:     { icon: Clock,         bg: "bg-amber-50 dark:bg-amber-500/10",    color: "text-amber-500 dark:text-amber-400" },
  report:    { icon: BarChart2,     bg: "bg-primary/8",                       color: "text-primary" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} год тому`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "вчора";
  return `${days} дн тому`;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const confirm = useConfirm();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      if (data.notifications) setNotifications(data.notifications);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter(n => !n.read).length;

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function dismiss(id: string) {
    await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNotifications(ns => ns.filter(n => n.id !== id));
  }

  async function clearAll() {
    const ok = await confirm({
      title: "Очистити всі сповіщення?",
      description: "Список сповіщень стане порожнім — відновити його не можна.",
    });
    if (!ok) return;
    await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearAll: true }) });
    setNotifications([]);
  }

  return (
    // z-30, not z-10: some pages (e.g. AI Коучинг) render their own sticky sub-header
    // (tabs row) right after this one, also at z-10 — two sibling stacking contexts at
    // EQUAL z-index paint in DOM order, so that later sticky bar was rendering on top of
    // THIS header's entire contents, including the z-50 notification dropdown nested
    // inside it (z-50 only wins comparisons within this header's own stacking context,
    // not against a same-level sibling that comes after it in the DOM).
    <header className="flex items-center justify-between px-6 border-b border-border bg-card sticky top-0 z-30 h-[73px]">
      <div>
        <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 700 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3 h-full">
        {actions && <div>{actions}</div>}

        {/* Both icons always render; CSS (not React state) decides which one shows —
            the `dark` class lands on <html> from an inline script before hydration
            (see layout.tsx), so a JS-conditional icon here would render "light" on the
            server and briefly disagree with the client's already-dark DOM, triggering
            a hydration mismatch. dark:hidden/dark:block sidesteps that entirely. */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Світла тема" : "Темна тема"}
          className="p-2 rounded-lg transition-colors text-muted-foreground hover:text-primary hover:bg-secondary"
        >
          <Sun className="w-4 h-4 dark:hidden" />
          <Moon className="w-4 h-4 hidden dark:block" />
        </button>

        {/* h-full needs an unbroken chain of explicit heights up to the header (h-[73px])
            for the percentage to resolve — otherwise (wrapper only as tall as the button,
            vertically centered) "top-full" lands a dozen-odd px before the header ends, and
            the dropdown's own top portion renders inside the sticky header's band. */}
        <div className="relative h-full flex items-center" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className={cn(
              "relative p-2 rounded-lg transition-colors",
              open ? "bg-primary/8 text-primary" : "text-muted-foreground hover:text-primary hover:bg-secondary"
            )}
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 bg-accent rounded-full
                flex items-center justify-center text-[10px] font-black text-white"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    Сповіщення
                  </p>
                  {unread > 0 && (
                    <span className="bg-accent text-white text-[10px] font-black px-1.5 py-0.5 rounded-full"
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      {unread} нових
                    </span>
                  )}
                </div>
                {unread > 0 && (
                  <button onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <Check className="w-3 h-3" /> Всі прочитані
                  </button>
                )}
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
                {notifications.length === 0 ? (
                  <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
                    <Bell className="w-8 h-8 opacity-20" />
                    <p className="text-xs font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      Немає сповіщень
                    </p>
                  </div>
                ) : (
                  notifications.map(n => {
                    const cfg = NOTIF_ICON[n.type] ?? NOTIF_ICON.report;
                    const Icon = cfg.icon;
                    return (
                      <div key={n.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 transition-colors group relative",
                          !n.read ? "bg-secondary" : "hover:bg-secondary/40"
                        )}>
                        {!n.read && (
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                        <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", cfg.bg)}>
                          <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                        </div>
                        <Link href={n.href ?? "#"} className="flex-1 min-w-0"
                          onClick={() => { markRead(n.id); setOpen(false); }}>
                          <p className={cn("text-xs font-bold leading-snug", n.read ? "text-muted-foreground" : "text-foreground")}
                            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug"
                            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{n.body}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                        </Link>
                        <button onClick={() => dismiss(n.id)}
                          className="shrink-0 p-1 rounded text-muted-foreground/30 hover:text-muted-foreground
                            opacity-0 group-hover:opacity-100 transition-all mt-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {notifications.length > 0 && (
                <div className="border-t border-border px-4 py-2.5 text-center">
                  <button onClick={clearAll}
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors font-medium"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    Очистити всі
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
