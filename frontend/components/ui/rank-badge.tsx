import { cn } from "@/lib/utils";

// Numbered parallelogram badge — matches the "01 / 02 / 03" step-badge motif from
// the Inweb slide deck (Послуги Inweb, Приклад воронки), built on the logo's
// diagonal-cut geometry. The skew is on a separate absolutely-positioned layer so
// the number itself stays upright and readable.
export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center w-6 h-6 shrink-0", className)}>
      <span className="absolute inset-0 bg-primary rounded-md" style={{ transform: "skewX(-10deg)" }} />
      <span className="relative z-10 text-[11px] font-black text-white leading-none" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
        {rank}
      </span>
    </span>
  );
}
