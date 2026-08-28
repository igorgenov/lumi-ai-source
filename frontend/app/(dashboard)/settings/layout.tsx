"use client";
import { useEffectiveRole } from "@/components/providers/view-as-provider";

import { Header } from "@/components/layout/header";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Lock, User, Plug, Users, Bell, CalendarClock, Sparkles, Wallet, History } from "lucide-react";

const TABS = [
  { id: "profile",       label: "Профіль",      icon: User },
  { id: "integrations",  label: "Інтеграції",   icon: Plug },
  { id: "access",        label: "Доступи",      icon: Users },
  { id: "notifications", label: "Сповіщення",   icon: Bell },
  { id: "reports",       label: "Звіти",        icon: CalendarClock },
  { id: "costs",         label: "Витрати на AI", icon: Wallet },
  { id: "audit-log",     label: "Журнал змін",  icon: History },
  { id: "changelog",     label: "Що нового",    icon: Sparkles },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const role = useEffectiveRole();
  const pathname = usePathname();
  const router = useRouter();

  if (status === "loading") return (
    <div>
      <Header title="Налаштування" subtitle="Управління акаунтом та інтеграціями" />
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  // "Що нового" is open to every role — everyone should see product updates,
  // not just admins. Rendered without the settings tab sidebar since a non-admin
  // has nowhere else to go from here anyway.
  if (role !== "admin" && role !== "owner" && pathname === "/settings/changelog") {
    return (
      <div>
        <Header title="Що нового" subtitle="Історія версій HuyumiAI" />
        <div className="p-6">{children}</div>
      </div>
    );
  }

  if (role !== "admin" && role !== "owner") {
    return (
      <div>
        <Header title="Налаштування" subtitle="Управління акаунтом та інтеграціями" />
        <div className="p-6 flex flex-col items-center justify-center h-64 gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary/40" />
          </div>
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Доступ обмежено</p>
          <p className="text-xs text-muted-foreground max-w-xs">Налаштування доступні лише для адміністраторів. Зверніться до керівника відділу.</p>
        </div>
      </div>
    );
  }

  const activeTab = TABS.find(t => pathname === `/settings/${t.id}`)?.id ?? "profile";

  return (
    <div>
      <Header title="Налаштування" subtitle="Управління акаунтом та інтеграціями" />
      <div className="p-6">
        <div className="flex gap-6">
          <aside className="w-48 shrink-0">
            <nav className="space-y-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => router.push(`/settings/${id}`)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                    activeTab === id
                      ? "bg-primary text-white font-medium"
                      : "text-foreground/70 hover:text-primary hover:bg-primary/6"
                  )}
                  style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
