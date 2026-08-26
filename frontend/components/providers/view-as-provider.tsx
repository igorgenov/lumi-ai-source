"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";

export type AppRole = "owner" | "admin" | "pm" | "viewer";
const STORAGE_KEY = "lumi_view_as_role";

// Client-side-only UI preview, not a real permission change — every API route still
// authorizes against the actual session role, so a manager/viewer can never grant
// themselves more access this way. Owner-only (not admin) — this is for the person
// who actually configures/builds Lumi, not day-to-day admins.
const ViewAsContext = createContext<{
  realRole: AppRole;
  viewAsRole: AppRole | null;
  setViewAsRole: (r: AppRole | null) => void;
} | null>(null);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const realRole = ((session?.user as { role?: string })?.role ?? "viewer") as AppRole;
  const canImpersonate = realRole === "owner";
  const [viewAsRole, setViewAsRoleState] = useState<AppRole | null>(null);

  useEffect(() => {
    if (!canImpersonate) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "owner" || stored === "admin" || stored === "pm" || stored === "viewer") {
      setViewAsRoleState(stored);
    }
  }, [canImpersonate]);

  function setViewAsRole(r: AppRole | null) {
    if (!canImpersonate) return;
    setViewAsRoleState(r);
    if (r) localStorage.setItem(STORAGE_KEY, r);
    else localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <ViewAsContext.Provider value={{ realRole, viewAsRole: canImpersonate ? viewAsRole : null, setViewAsRole }}>
      {children}
    </ViewAsContext.Provider>
  );
}

/** The role every page should render against — real role, unless owner/admin is previewing another one. */
export function useEffectiveRole(): AppRole {
  const ctx = useContext(ViewAsContext);
  return ctx ? ctx.viewAsRole ?? ctx.realRole : "viewer";
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) throw new Error("useViewAs must be used within ViewAsProvider");
  return ctx;
}
