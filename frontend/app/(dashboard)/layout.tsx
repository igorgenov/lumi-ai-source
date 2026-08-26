export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/layout/sidebar";
import { ChangelogFooterLink } from "@/components/layout/changelog-footer-link";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ViewAsProvider } from "@/components/providers/view-as-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewAsProvider>
    <ConfirmProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="shrink-0 border-t border-border bg-card px-6 py-3 grid grid-cols-3 items-center">
          {/* Left: Developed by — w-fit so the clickable area matches the visible
              content instead of stretching across the whole grid column. */}
          <a href="https://inweb.ua/ua/" target="_blank" rel="noopener noreferrer"
            className="w-fit inline-flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-foreground"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>Розроблено в</span>
            <img src="/inweb-logo-black.png" alt="Inweb" style={{ height: 14, width: "auto", marginTop: -2 }} />
          </a>

          {/* Center: Copyright + changelog "unread" dot */}
          <ChangelogFooterLink />

          {/* Right: Developer contact — w-fit + ml-auto so the clickable area
              matches the visible content instead of stretching across the column. */}
          <a href="https://t.me/kawasaki_inweb" target="_blank" rel="noopener noreferrer"
            className="w-fit ml-auto inline-flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground/50 hover:text-[#229ED9] transition-colors"
            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Розробник: t.me/kawasaki_inweb
          </a>
        </footer>
      </main>
    </div>
    </ConfirmProvider>
    </ViewAsProvider>
  );
}
