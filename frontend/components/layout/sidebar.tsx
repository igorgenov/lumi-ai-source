"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEffectiveRole, useViewAs, AppRole } from "@/components/providers/view-as-provider";
import {
  LayoutDashboard, MessageSquare, Users, Lightbulb,
  FileText, Sparkles, Settings, LogOut, Eye, ChevronDown, X, FolderKanban,
} from "lucide-react";

const PRIVILEGED = ["owner", "admin"];

// Grouped with a thin divider between groups (not text labels — keeps the sidebar
// scannable as the page count grows without adding visual clutter): raw records first,
// then AI-derived analysis pages, then config.
const NAV_GROUPS = [
  [
    { href: "/dashboard",      label: "Дашборд",    icon: LayoutDashboard, roles: ["owner", "admin", "pm", "viewer"] },
    { href: "/pm",             label: "PM",          icon: FolderKanban,    roles: ["owner", "admin", "pm"] },
    { href: "/conversations",  label: "Розмови",    icon: MessageSquare,   roles: ["owner", "admin", "pm", "viewer"] },
    { href: "/team",           label: "Команда",    icon: Users,            roles: ["owner", "admin", "pm"] },
  ],
  [
    { href: "/coaching",       label: "AI Коучинг", icon: Lightbulb,        roles: ["owner", "admin", "pm"] },
    { href: "/insights",       label: "Інсайти",    icon: Sparkles,         roles: ["owner", "admin", "pm", "viewer"] },
  ],
  [
    { href: "/prompts",        label: "Промти",     icon: FileText,         roles: ["owner", "admin", "pm"] },
  ],
];

const ROLE_LABEL: Record<string, string> = {
  owner:   "Власник",
  admin:   "Адміністратор",
  pm:      "Менеджер проєктів",
  viewer:  "Перегляд",
};

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { realRole, viewAsRole, setViewAsRole } = useViewAs();
  const role = useEffectiveRole();
  const userName = session?.user?.name ?? "Користувач";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image ?? null;
  const userInitial = userName.charAt(0).toUpperCase();

  const visibleGroups = NAV_GROUPS
    .map(group => group.filter(item => item.roles.includes(role)))
    .filter(group => group.length > 0);

  return (
    <aside className="flex flex-col h-screen border-r border-border shrink-0 bg-card w-60">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center justify-center px-4 border-b border-border hover:bg-secondary/40 transition-colors h-[73px]">
        {/* Two separate assets, not a CSS filter (dark:invert) — a filter would also
            invert the orange accent to a mismatched blue. huyumi-logo-dark.png is
            pre-recolored (green→white, orange kept as-is). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/huyumi-logo.png" alt="HuyumiAI" className="dark:hidden" style={{ maxWidth: "150px", maxHeight: "46px", width: "auto", height: "auto" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/huyumi-logo-dark.png" alt="HuyumiAI" className="hidden dark:block" style={{ maxWidth: "150px", maxHeight: "46px", width: "auto", height: "auto" }} />
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {visibleGroups.map((group, i) => (
          <div key={i} className={i > 0 ? "mt-2 pt-2 border-t border-border" : undefined}>
            {group.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground/70 hover:text-primary hover:bg-primary/6 font-normal"
                  )}
                  style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 mb-2">
        <div className="h-px bg-border" />
      </div>

      <div className="px-2 py-3 space-y-0.5">
        {/* Settings — admin та owner */}
        {PRIVILEGED.includes(role) && (
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
              pathname.startsWith("/settings")
                ? "bg-primary text-primary-foreground font-medium"
                : "text-foreground/60 hover:text-primary hover:bg-primary/6"
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Налаштування
          </Link>
        )}

        {/* View-as switcher — owner/admin only. Client-side preview only: every API
            route still authorizes against the real session role, so this can never
            grant a lower-privileged account more access than it actually has. */}
        {realRole === "owner" && (
          viewAsRole ? (
            <div className="flex items-center justify-between gap-2 mx-1 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30">
              <span className="text-[11px] font-semibold text-accent-strong flex items-center gap-1.5 truncate"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <Eye className="w-3.5 h-3.5 shrink-0" /> Перегляд: {ROLE_LABEL[viewAsRole]}
              </span>
              <button onClick={() => setViewAsRole(null)} title="Повернутись до власного вигляду"
                className="text-accent-strong hover:text-primary transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative mx-1">
              <button onClick={() => setSwitcherOpen(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-colors">
                <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Переглянути як…</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform", switcherOpen && "rotate-180")} />
              </button>
              {switcherOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-full bg-card border border-border rounded-lg shadow-lg py-1 z-20">
                  {(["pm", "viewer"] as AppRole[]).map(r => (
                    <button key={r} onClick={() => { setViewAsRole(r); setSwitcherOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors">
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt={userName} className="w-7 h-7 rounded-lg object-cover shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {userInitial}
            </div>
          )}
          <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Вийти"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
        </div>
      </div>

    </aside>
  );
}
