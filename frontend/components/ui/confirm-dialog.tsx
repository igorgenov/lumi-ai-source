"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red/destructive styling by default — set false for a neutral (purple) confirm. */
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mounted once in the dashboard layout. Renders the actual modal when a confirm() is pending. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(opts => {
    return new Promise<boolean>(resolve => setState({ ...opts, resolve }));
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5 animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                state.danger === false ? "bg-amber-50 dark:bg-amber-500/10" : "bg-red-50 dark:bg-red-500/10"
              )}>
                <AlertTriangle className={cn("w-5 h-5", state.danger === false ? "text-amber-500" : "text-red-500")} />
              </div>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                  {state.title}
                </h3>
                {state.description && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{state.description}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => close(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-secondary/60 transition-colors"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
              >
                {state.cancelLabel ?? "Скасувати"}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={cn(
                  "px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors",
                  state.danger === false ? "bg-primary hover:bg-primary-hover" : "bg-red-600 hover:bg-red-700"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
              >
                {state.confirmLabel ?? "Видалити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Usage: const confirm = useConfirm(); if (await confirm({ title: "...", description: "..." })) { ...delete... } */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}
