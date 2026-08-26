"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Single source of truth for the "hover ⓘ → dark tooltip" pattern used all over the
// dashboard — this used to be copy-pasted into 9 different files (managers, coaching,
// conversations, contragents, dashboard, stat-card...), which is exactly how the
// contragents-list phantom-scroll bug happened: one copy got the fixed-position fix,
// the others didn't. Fixed positioning (computed via getBoundingClientRect on hover,
// rendered centered above the trigger) instead of a plain `absolute` child avoids two
// separate bugs seen in this codebase: getting clipped by an ancestor's overflow-hidden,
// and inflating an ancestor's scrollWidth even while invisible (opacity-0).
const HINT_WIDTH = 224; // w-56

// Rough estimate of rendered tooltip height (2-3 lines at this font/line-height/padding)
// — exact height isn't knowable before the portal paints, but this is enough margin to
// decide whether flipping below the icon is needed instead of measuring after the fact.
const HINT_EST_HEIGHT = 70;

export function InfoHint({ text, className }: { text: string; className?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Centering on the icon (the default) pushes the box off-screen when the icon
    // sits near the viewport edge (e.g. the rightmost column of a wide table) —
    // clamp so it always stays fully visible, even if no longer perfectly centered.
    const half = HINT_WIDTH / 2;
    const margin = 8;
    const rawLeft = r.left + r.width / 2;
    const left = Math.min(Math.max(rawLeft, half + margin), window.innerWidth - half - margin);
    // Same clipping bug, vertical axis: an icon near the top of the viewport (e.g.
    // right under a page header) doesn't leave room for the tooltip above it, so it
    // renders off-screen and gets cut — flip to below the icon in that case instead.
    const placement = r.top - 8 < HINT_EST_HEIGHT ? "bottom" : "top";
    const top = placement === "top" ? r.top - 8 : r.bottom + 8;
    setPos({ top, left, placement });
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold text-muted-foreground/50 hover:text-primary hover:bg-primary/8 cursor-default transition-colors select-none"
      >
        ⓘ
      </span>
      {pos && createPortal(
        <span
          className={cn(
            "fixed w-56 bg-[#1C1C1C] text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-lg pointer-events-none z-[9999] whitespace-normal normal-case font-normal tracking-normal -translate-x-1/2 block",
            pos.placement === "top" ? "-translate-y-full" : ""
          )}
          style={{ top: pos.top, left: pos.left, fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          {text}
          <span className={cn(
            "absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#1C1C1C] rotate-45",
            pos.placement === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
          )} />
        </span>,
        document.body
      )}
    </span>
  );
}

// Alias — half the codebase called this "Hint", half "InfoHint", for the identical
// component. Keeping both names means every call site can import without renaming.
export const Hint = InfoHint;
