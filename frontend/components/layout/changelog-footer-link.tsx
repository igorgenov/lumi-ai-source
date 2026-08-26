"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { load, LATEST_CHANGELOG_VERSION, CHANGELOG_SEEN_KEY } from "@/app/(dashboard)/settings/_components";

// Re-reads localStorage on every route change (usePathname re-renders this on
// navigation) so the dot disappears immediately after visiting /settings/changelog,
// without needing a full page reload or a shared global state. Starts at `false`
// and only checks localStorage after mount, to avoid a server/client hydration
// mismatch (the server has no localStorage to read).
export function ChangelogFooterLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    setUnread(load<string | null>(CHANGELOG_SEEN_KEY, null) !== LATEST_CHANGELOG_VERSION);
  }, [pathname]);

  return (
    <Link href="/settings/changelog"
      className="relative w-fit mx-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-primary transition-colors"
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      © 2026 Lumi AI · {LATEST_CHANGELOG_VERSION}
      {unread && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Є новини" />
      )}
    </Link>
  );
}
