"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn, scoreColor, scoreBarColor, scoreHexColor, generateSlug, KIND_COLORS, SERVICE_COLORS, SCORE_ZONES, ZONE_TARGET } from "@/lib/utils";
import { MessageSquare, Star, Clock, Phone, Video, Send, ArrowRight, ExternalLink, BarChart2, TrendingUp } from "lucide-react";
import { BrandCheck } from "@/components/icons/brand-icons";
import { RankBadge } from "@/components/ui/rank-badge";
import Link from "next/link";
import { DateRangePicker, DateRange, currentWeekRange } from "@/components/ui/date-range-picker";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useManagers, ManagerWithStats } from "@/hooks/useManagers";
import { ManagerAvatar } from "@/components/ui/manager-avatar";
import { InfoHint } from "@/components/ui/info-hint";

// ── Gauge helpers ─────────────────────────────────────────────────────────────
function gaugeArc(score: number, cx: number, cy: number, r: number) {
  const angleDeg = 180 - (score / 100) * 180;
  const rad = (angleDeg * Math.PI) / 180;
  const ex = cx + r * Math.cos(rad);
  const ey = cy - r * Math.sin(rad);
  const largeArc = score > 100 ? 1 : 0;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function ScoreGaugeCard({ score, scoreChange }: { score: number; scoreChange: number | null }) {
  const cx = 100, cy = 90, r = 62;
  const startX = cx - r, endX = cx + r;
  const bgArc = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${endX} ${cy}`;
  const scoreArcPath = gaugeArc(score, cx, cy, r);
  const color = scoreHexColor(score);

  let changeEl: React.ReactNode = <span className="text-xs text-muted-foreground/50">— немає даних минулого тижня</span>;
  if (scoreChange !== null) {
    const up = scoreChange >= 0;
    changeEl = (
      <span className={cn("text-xs font-medium", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
        {up ? "↑" : "↓"} {Math.abs(scoreChange)} бал. vs тиждень тому
      </span>
    );
  }

  return (
    <Link href="/team" className="relative bg-card border border-primary/10 rounded-xl p-5 flex flex-col gap-2 cursor-pointer hover:shadow-md hover:border-primary/20 active:scale-[0.99] transition-all duration-150 group">
      <InfoHint text="Середній бал по всій команді за обраний період — всі типи зустрічей (єдині типи з активними критеріями оцінки)." className="absolute top-3 right-3 z-10" />
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider pr-5"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Середній AI-бал</p>
        <div className="p-2 rounded-lg bg-accent/15 text-accent-strong"><Star className="w-4 h-4" /></div>
      </div>
      <div className="-mt-1">
        <svg viewBox="0 0 200 110" className="w-full" style={{ maxHeight: 90 }}>
          <path d={bgArc} fill="none" stroke="#D0E2D4" strokeWidth="10" strokeLinecap="round" />
          <path d={scoreArcPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="22" fontWeight="900"
            fill={color} fontFamily="var(--font-unbounded), sans-serif">{score || "—"}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9" fill="#6B7280"
            fontFamily="var(--font-unbounded), sans-serif">з 100</text>
        </svg>
      </div>
      <div className="flex items-center justify-between -mt-1">{changeEl}</div>
      <div className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/50 group-hover:text-primary transition-colors"
        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
        Детальніше <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  );
}

// ── Bar chart (week activity) ─────────────────────────────────────────────────
function WeekBarChart({ data }: { data: { day: string; date: string; calls: number; meetings: number; chats: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const router = useRouter();
  const [showCalls, setShowCalls] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showChats, setShowChats] = useState(true);

  const maxVal = Math.max(...data.flatMap(d => [d.calls, d.meetings, d.chats]), 1);
  const W = 900, H = 300, PB = 32, PT = 16;
  const groupW = Math.floor((W - 36) / Math.max(data.length, 1));
  const barW = Math.max(6, Math.min(18, Math.floor(groupW * 0.2)));
  const gap = Math.max(2, Math.floor(barW * 0.2));

  const toY = (v: number) => PT + (1 - v / maxVal) * (H - PT - PB);
  const barH = (v: number) => Math.max((v / maxVal) * (H - PT - PB), v > 0 ? 3 : 0);

  // Y grid — deduped because during the initial render (before real stats load,
  // maxVal defaults to 1) the rounding produces duplicate values like [0,0,1,1,1].
  // Duplicate React keys on that first pass left orphaned <text> nodes behind once
  // real data replaced them, showing a stale "1" ghosted under the correct tick.
  const gridCount = 4;
  const gridVals = Array.from(new Set(Array.from({ length: gridCount + 1 }, (_, i) => Math.round((maxVal / gridCount) * i))));

  return (
    <div className="relative bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <InfoHint text="Кількість дзвінків, зустрічей і Telegram-чатів за вибраний період. Клікніть на день щоб відкрити розмови за нього." className="absolute top-3 right-3 z-10" />
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Активність за тиждень
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => setShowCalls(v => !v)}
            className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-all select-none",
              showCalls ? "text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/15 font-semibold" : "text-muted-foreground/40 line-through")}
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <span className={cn("w-3 h-3 rounded-sm inline-block", showCalls ? "bg-indigo-500" : "bg-muted-foreground/30")} />
            Дзвінки
          </button>
          <button onClick={() => setShowMeetings(v => !v)}
            className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-all select-none",
              showMeetings ? "text-accent-strong bg-accent/10 font-semibold" : "text-muted-foreground/40 line-through")}
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <span className={cn("w-3 h-3 rounded-sm inline-block", showMeetings ? "bg-accent" : "bg-muted-foreground/30")} />
            Зустрічі
          </button>
          <button onClick={() => setShowChats(v => !v)}
            className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md transition-all select-none",
              showChats ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 font-semibold" : "text-muted-foreground/40 line-through")}
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            <span className={cn("w-3 h-3 rounded-sm inline-block", showChats ? "bg-emerald-500" : "bg-muted-foreground/30")} />
            Чати
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {/* Grid */}
        {gridVals.map(v => (
          <g key={v}>
            <line x1={30} y1={toY(v)} x2={W} y2={toY(v)} stroke="#E5E7EB" strokeWidth="1"
              strokeDasharray={v === 0 ? "0" : "3 3"} />
            <text x={24} y={toY(v) + 4} fontSize="11" fill="#6B7280" textAnchor="end"
              fontFamily="var(--font-geist-sans), sans-serif">{v}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = 36 + i * groupW + groupW / 2;
          const isHov = hovered === i;
          // call bar: left of center, meeting bar: center, chat bar: right of center
          const callX = cx - barW * 1.5 - gap;
          const meetX = cx - barW / 2;
          const chatX = cx + barW / 2 + gap;

          return (
            <g key={i}>
              {/* Placeholder bars for empty days */}
              {showCalls && d.calls === 0 && (
                <rect x={callX} y={H - PB - 3} width={barW} height={3} rx="2" fill="#E5E7EB" />
              )}
              {showMeetings && d.meetings === 0 && (
                <rect x={meetX} y={H - PB - 3} width={barW} height={3} rx="2" fill="#E5E7EB" />
              )}
              {showChats && d.chats === 0 && (
                <rect x={chatX} y={H - PB - 3} width={barW} height={3} rx="2" fill="#E5E7EB" />
              )}
              {/* Bars */}
              {showCalls && d.calls > 0 && (
                <rect x={callX} y={toY(d.calls)} width={barW} height={barH(d.calls)}
                  rx="3" fill="#6366F1" opacity={isHov ? 1 : 0.8} style={{ transition: "opacity 0.15s" }} />
              )}
              {showMeetings && d.meetings > 0 && (
                <rect x={meetX} y={toY(d.meetings)} width={barW} height={barH(d.meetings)}
                  rx="3" fill="#EF583D" opacity={isHov ? 1 : 0.8} style={{ transition: "opacity 0.15s" }} />
              )}
              {showChats && d.chats > 0 && (
                <rect x={chatX} y={toY(d.chats)} width={barW} height={barH(d.chats)}
                  rx="3" fill="#10B981" opacity={isHov ? 1 : 0.8} style={{ transition: "opacity 0.15s" }} />
              )}

              {/* Value labels — always visible, not just on hover, so exact counts don't
                  require a mouse (touch devices never trigger hover at all). */}
              {showCalls && d.calls > 0 && (
                <text x={callX + barW / 2} y={toY(d.calls) - 4} fontSize="10" fill="#4F46E5"
                  textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight="700">{d.calls}</text>
              )}
              {showMeetings && d.meetings > 0 && (
                <text x={meetX + barW / 2} y={toY(d.meetings) - 4} fontSize="10" fill="#C8452E"
                  textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight="700">{d.meetings}</text>
              )}
              {showChats && d.chats > 0 && (
                <text x={chatX + barW / 2} y={toY(d.chats) - 4} fontSize="10" fill="#059669"
                  textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight="700">{d.chats}</text>
              )}

              {/* Hover zone + click */}
              <rect x={cx - groupW / 2} y={PT} width={groupW} height={H - PT - PB}
                fill="transparent" style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => router.push(`/conversations?from=${d.date}&to=${d.date}`)}
              />

              {/* X label */}
              <text x={cx} y={H - 6} fontSize="11" fill={isHov ? "#003B29" : "#6B7280"}
                textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif" fontWeight={isHov ? "900" : "700"}>
                {d.day}
              </text>

              {/* Highlight bg */}
              {isHov && (
                <rect x={cx - groupW / 2 + 4} y={PT} width={groupW - 8} height={H - PT - PB}
                  rx="4" fill="#003B29" opacity={0.04} style={{ pointerEvents: "none" }} />
              )}
            </g>
          );
        })}
      </svg>
      </div>
    </div>
  );
}

// ── Score distribution (the three coaching zones — red/yellow/green) ──────────
// ZONE_TARGET now lives in lib/utils.ts (shared with the per-manager widget).

function ScoreDistribution({ data }: { data: { range: string; count: number }[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  const zoneByValue = Object.fromEntries(SCORE_ZONES.map(z => [z.value, z]));

  return (
    <div className="relative bg-card border border-border rounded-xl p-5">
      <InfoHint text="Скільки дзвінків і зустрічей (всі типи зустрічей) потрапило в кожну з трьох зон якості — чати сюди не входять, бо для них поки немає окремої цілі. Ціль на Q3: зелена не менше 20%, червона не більше 15%." className="absolute top-3 right-3 z-10" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
        <h3 className="text-sm font-bold text-foreground mb-5" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Розподіл по зонах
        </h3>
        <h3 className="text-sm font-bold text-foreground mb-5 lg:border-l lg:border-border lg:pl-8" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Що означають зони
        </h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <div className="space-y-3">
            {data.map(({ range, count }) => {
              const zone = zoneByValue[range];
              if (!zone) return null;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const isHov = hovered === range;
              const target = ZONE_TARGET[range];
              return (
                <Link key={range} href={`/conversations?score=${range}`}
                  className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors",
                    isHov ? "bg-secondary/60" : "hover:bg-secondary/40")}
                  onMouseEnter={() => setHovered(range)} onMouseLeave={() => setHovered(null)}>
                  <span className={cn("text-xs w-16 shrink-0 transition-colors flex items-center gap-1",
                    isHov ? "text-primary font-bold" : "text-muted-foreground")}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.hex }} />
                    {zone.label}
                  </span>
                  <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden relative">
                    <div className={cn("h-full rounded-full transition-all duration-300", zone.bar)}
                      style={{ width: `${pct}%` }} />
                    {target && (
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/30" style={{ left: `${target.value}%` }}
                        title={`Ціль Q3: ${target.type === "min" ? "не менше" : "не більше"} ${target.value}%`} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 w-16 justify-end shrink-0">
                    <span className={cn("text-xs font-black transition-colors", isHov ? "text-primary" : "text-foreground")}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{count}</span>
                    {isHov && <span className="text-[10px] font-semibold text-muted-foreground">{pct}%</span>}
                    {isHov && <ExternalLink className="w-3 h-3 text-muted-foreground ml-0.5" />}
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground">Всього розмов з балом (брифування/КП)</span>
            <span className="font-black text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{total}</span>
          </div>
        </div>
        <div className="space-y-2.5 lg:border-l lg:border-border lg:pl-8">
          {SCORE_ZONES.map(zone => (
            <div key={zone.value} className={cn("flex items-start gap-1.5 transition-colors", hovered === zone.value && "text-primary")}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: zone.hex }} />
              <p className="text-[11px] leading-snug">
                <span className="font-semibold">{zone.label} ({zone.range} балів).</span>{" "}
                <span className="text-muted-foreground">{zone.description}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zone trend — 100%-stacked bar per period bucket, same buckets as the weekly
// activity chart above. Complements the (period-summed) "Розподіл по зонах" by
// showing whether red is actually shrinking and green actually growing over time,
// i.e. real progress toward the Q3 zone targets rather than a single snapshot.
function ZoneTrend({ data }: { data: { day: string; date: string; red: number; yellow: number; green: number; total: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const zoneByValue = Object.fromEntries(SCORE_ZONES.map(z => [z.value, z]));
  const hasAny = data.some(d => d.total > 0);

  const W = 300, H = 220, PT = 20, PB = 24, PL = 6, PR = 6;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const groupW = chartW / Math.max(data.length, 1);
  const barW = Math.max(8, Math.min(26, groupW * 0.45));

  return (
    <div className="relative bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <InfoHint text="Частка дзвінків і зустрічей у кожній зоні по періодах — показує, чи справді скорочується червона зона і росте зелена з часом, тобто прогрес до цілей Q3 (не лише знімок за весь період)." className="absolute top-3 right-3 z-10" />
      <h3 className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
        Тренд зон
      </h3>
      {!hasAny ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <BarChart2 className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Немає оцінених розмов за цей період</p>
        </div>
      ) : (
        <div className="flex-1 flex items-center">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
            {data.map((d, i) => {
              const cx = PL + i * groupW + groupW / 2;
              const isHov = hovered === i;
              const share = (n: number) => (d.total > 0 ? n / d.total : 0);
              let yCursor = PT + chartH;
              const segs = (["red", "yellow", "green"] as const).map(zone => {
                const h = share(d[zone]) * chartH;
                const y = yCursor - h;
                yCursor = y;
                return { zone, y, h };
              });
              return (
                <g key={i}>
                  {d.total === 0 ? (
                    <rect x={cx - barW / 2} y={PT + chartH - 3} width={barW} height={3} rx="2" fill="#E5E7EB" />
                  ) : segs.map(s => s.h > 0 && (
                    <rect key={s.zone} x={cx - barW / 2} y={s.y} width={barW} height={s.h}
                      fill={zoneByValue[s.zone].hex} opacity={isHov ? 1 : 0.85} style={{ transition: "opacity 0.15s" }} />
                  ))}
                  {isHov && d.total > 0 && (
                    <text x={cx} y={PT - 6} fontSize="10" fill="#1C1C1C" textAnchor="middle"
                      fontFamily="var(--font-unbounded), sans-serif" fontWeight="700">
                      {Math.round(share(d.red) * 100)}/{Math.round(share(d.yellow) * 100)}/{Math.round(share(d.green) * 100)}%
                    </text>
                  )}
                  <rect x={cx - groupW / 2} y={PT} width={groupW} height={chartH} fill="transparent" style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
                  <text x={cx} y={H - 6} fontSize="10" fill={isHov ? "#003B29" : "#6B7280"} textAnchor="middle"
                    fontFamily="var(--font-unbounded), sans-serif" fontWeight={isHov ? "900" : "500"}>
                    {d.day}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2 justify-center">
        {SCORE_ZONES.map(zone => (
          <span key={zone.value} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: zone.hex }} />
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Manager activity horizontal bars ─────────────────────────────────────────
function ManagerActivity({ data }: { data: { id: string; name: string; total: number; avgScore: number }[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxTotal = Math.max(...data.map(d => d.total), 1);

  return (
    <div className="relative bg-card border border-border rounded-xl p-5">
      <InfoHint text="Кількість розмов усіх типів по кожному менеджеру за обраний період. Середній AI-бал — лише по «Брифуванню» та «Презентації КП» (єдині типи з активними критеріями оцінки)." className="absolute top-3 right-3 z-10" />
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Активність менеджерів
        </h3>
        <Link href="/team" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
          Всі <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
          <BarChart2 className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Немає даних за цей період</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.map(({ id, name, total, avgScore }) => {
            const isHov = hovered === id;
            const pct = Math.round((total / maxTotal) * 100);
            const shortName = (() => {
              const parts = name.split(" ");
              return parts.length >= 2 ? `${parts[0]} ${parts[1].charAt(0)}.` : name;
            })();
            return (
              <Link key={id} href={`/team/${generateSlug(name)}`}
                className={cn("-mx-2 px-2 py-1.5 rounded-lg block transition-all duration-150",
                  isHov ? "bg-secondary/70" : "hover:bg-secondary/40")}
                onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={cn("font-medium transition-colors truncate max-w-[120px]",
                    isHov ? "text-primary font-bold" : "text-foreground")}>{shortName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{total} розм.</span>
                    {avgScore > 0 && (
                      <span className={cn("font-black text-sm", scoreColor(avgScore))}
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{avgScore}</span>
                    )}
                    {isHov && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-300", scoreBarColor(avgScore))}
                      style={{ width: `${pct}%`, opacity: isHov ? 1 : 0.7 }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Manager score trend (weeks of current month, multi-line) ─────────────────
function ManagerTrendChart({ managers }: { managers: ManagerWithStats[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hovWeek, setHovWeek] = useState<number | null>(null);

  const relevant = managers.filter(m => m.stats.weeklyScores.some(s => s.score > 0));
  const COLORS = ["#003B29","#EF583D","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];

  if (relevant.length === 0) {
    return (
      <div className="relative bg-card border border-border rounded-xl p-5 flex-1 flex flex-col">
        <InfoHint text="Середній AI-бал кожного менеджера по тижнях поточного місяця — всі типи зустрічей." className="absolute top-3 right-3 z-10" />
        <h3 className="text-sm font-bold text-foreground mb-4 shrink-0" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
          Тренд балів менеджерів
        </h3>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Дані з'являться після першого AI-аналізу розмов</p>
        </div>
      </div>
    );
  }

  const weekLabels = relevant[0].stats.weeklyScores.map(s => s.week);
  // H only affects the grid row's intrinsic height estimate (the SVG itself fills
  // whatever height flex-1 + preserveAspectRatio="none" end up giving it) — kept
  // lower than WeekBarChart's so this row isn't taller than "Остання активність"
  // actually needs, which left dead space stretched into that card.
  const W = 900, H = 210, PL = 32, PR = 8, PT = 12, PB = 24;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const toX = (i: number) => PL + i * (chartW / (weekLabels.length - 1));
  const toY = (v: number) => PT + (1 - v / 100) * chartH;
  const gridVals = [25, 50, 75, 100];

  // Date range label for the 5 calendar weeks shown (mirrors buildWeeklyScores logic)
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - dow);
  const rangeStart = new Date(thisMonday);
  rangeStart.setDate(thisMonday.getDate() - 28);
  const rangeEnd = new Date(thisMonday);
  rangeEnd.setDate(thisMonday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  const periodLabel = `${fmt(rangeStart)} – ${fmt(rangeEnd)}`;

  return (
    <div className="relative bg-card border border-border rounded-xl p-5 flex-1 flex flex-col">
      <InfoHint text="Середній AI-бал кожного менеджера по 5 останніх календарних тижнях — всі типи зустрічей." className="absolute top-3 right-3 z-10" />
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
            Тренд балів менеджерів
          </h3>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
        <Link href="/team" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
          Деталі <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* flex-1 + preserveAspectRatio="none" so the chart actually fills whatever
          height the grid row gives this card (varies with viewport/content on the
          other side), instead of a fixed aspect ratio that leaves dead space or
          gets clipped depending on screen size. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 min-h-0" style={{ overflow: "visible" }}>
        {gridVals.map(v => (
          <g key={v}>
            <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#F3F4F6" strokeWidth="1" />
            <text x={PL - 4} y={toY(v) + 4} fontSize="11" fill="#6B7280" textAnchor="end"
              fontFamily="var(--font-geist-sans), sans-serif">{v}</text>
          </g>
        ))}

        {hovWeek !== null && (
          <line x1={toX(hovWeek)} y1={PT} x2={toX(hovWeek)} y2={PT + chartH}
            stroke="#003B29" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.3" />
        )}

        {relevant.map((mgr, mi) => {
          const color = COLORS[mi % COLORS.length];
          const scores = mgr.stats.weeklyScores;
          const pts = scores.map((s, i) => ({ x: toX(i), y: s.score > 0 ? toY(s.score) : null, v: s.score }));
          const validPts = pts.filter(p => p.y !== null) as { x: number; y: number; v: number }[];
          if (validPts.length === 0) return null;
          const path = validPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const isHov = hovered === mgr.id;
          return (
            <g key={mgr.id} opacity={hovered && !isHov ? 0.15 : 1} style={{ transition: "opacity 0.15s" }}>
              <path d={path} fill="none" stroke={color} strokeWidth={isHov ? 3 : 2}
                strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => p.y !== null && (
                <circle key={i} cx={p.x} cy={p.y!} r={isHov ? 5.5 : 4}
                  fill="white" stroke={color} strokeWidth="2" />
              ))}
            </g>
          );
        })}

        {weekLabels.map((lbl, i) => (
          <g key={i}>
            <text x={toX(i)} y={H - 6} fontSize="11" fill={hovWeek === i ? "#003B29" : "#6B7280"}
              textAnchor="middle" fontFamily="var(--font-unbounded), sans-serif">{lbl}</text>
            <rect x={toX(i) - chartW / (2 * (weekLabels.length - 1))} y={PT} width={chartW / (weekLabels.length - 1)} height={chartH}
              fill="transparent"
              onMouseEnter={() => setHovWeek(i)}
              onMouseLeave={() => setHovWeek(null)} />
          </g>
        ))}
      </svg>

      <div className="flex flex-wrap gap-2 mt-1 shrink-0">
        {relevant.map((mgr, ci) => {
          const color = COLORS[ci % COLORS.length];
          const scores = mgr.stats.weeklyScores;
          const lastScore = [...scores].reverse().find(s => s.score > 0)?.score ?? 0;
          const prevScore = [...scores].slice(0, -1).reverse().find(s => s.score > 0)?.score ?? 0;
          const trend = lastScore > 0 && prevScore > 0 ? lastScore - prevScore : null;
          return (
            <button key={mgr.id}
              onMouseEnter={() => setHovered(mgr.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all",
                hovered === mgr.id ? "bg-secondary/60" : "hover:bg-secondary/30")}
            >
              <span className="w-8 h-0.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {mgr.name.split(" ")[0]}
              </span>
              {lastScore > 0 && (
                <span className={cn("text-xs font-black", scoreColor(lastScore))}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{lastScore}</span>
              )}
              {trend !== null && (
                <span className={cn("text-[10px] font-medium", trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-400" : "text-muted-foreground")}>
                  {trend > 0 ? `+${trend}` : trend}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>(currentWeekRange);
  const { stats } = useDashboardStats(dateRange);
  const { managers } = useManagers();

  return (
    <div>
      <Header
        title="Дашборд"
        subtitle={`Сьогодні, ${new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}`}
        actions={<DateRangePicker value={dateRange} onChange={setDateRange} align="right" />}
      />
      <div className="p-6 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Розмов за період" value={stats.totalConversations}
            change={stats.weeklyChange.conversations ?? undefined} changeLabel="vs тиждень тому"
            icon={MessageSquare} accent="green"
            hint="Загальна кількість дзвінків і Google Meet-зустрічей що потрапили до системи за обраний період."
            href="/conversations"
          />

          <ScoreGaugeCard score={stats.avgTeamScore} scoreChange={stats.weeklyChange.avgScore} />

          <StatCard
            title="Проаналізовано"
            value={stats.analyzedPct > 0 ? `${stats.analyzedPct}%` : stats.analyzedConversations}
            change={stats.weeklyChange.analyzedPct ?? undefined} changeLabel="vs тиждень тому"
            icon={Star} accent="green"
            hint="Відсоток розмов що вже пройшли AI-аналіз від загальної кількості за обраний період."
            href="/conversations?status=analyzed"
          />

          {stats.pendingAnalysis === 0 ? (
            <div className="relative bg-card border border-primary/20 rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
              <InfoHint text="Кількість розмов що очікують на обробку AI. Аналіз запускається автоматично після завершення дзвінка." className="absolute top-3 right-3 z-10" />
              <div className="flex items-start justify-between">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Аналіз AI</p>
                <div className="p-2 rounded-lg bg-primary/8 text-primary">
                  <BrandCheck className="w-4 h-4" />
                </div>
              </div>
              <div>
                <BrandCheck className="w-7 h-7 text-primary" />
                <p className="text-xs mt-1 font-medium text-primary">Всі розмови проаналізовано</p>
              </div>
            </div>
          ) : (
            <StatCard
              title="Очікують аналізу" value={stats.pendingAnalysis}
              icon={Clock} accent="yellow"
              hint="Кількість розмов що очікують на обробку AI. Аналіз запускається автоматично після завершення дзвінка."
              href="/conversations?status=pending"
            />
          )}
        </div>

        {/* Row 2: Bar chart + Recent activity — freshest, most actionable info stays
            near the top instead of requiring a scroll to see. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-full">
            <WeekBarChart data={stats.weeklyConversations} />
          </div>

          {/* Recent activity */}
          <div className="relative bg-card border border-border rounded-xl p-5">
            <InfoHint text="Останні 5 розмов у системі. Натисніть щоб відкрити детальний AI-аналіз." className="absolute top-3 right-3 z-10" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Остання активність</h3>
              <Link href="/conversations" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                Всі <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-1">
              {stats.recentActivity.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Немає розмов</p>
              ) : stats.recentActivity.map((item) => (
                <Link key={item.id} href={`/conversations/${item.id}`}
                  className="flex items-center gap-3 hover:bg-secondary/60 -mx-2 px-2 py-2 rounded-lg transition-colors">
                  <div className="p-1.5 rounded-md shrink-0 bg-secondary text-muted-foreground">
                    {item.type === "call" ? <Phone className="w-3 h-3" />
                      : item.type === "chat" ? <Send className="w-3 h-3" />
                      : <Video className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{item.clientName}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.managerName}</p>
                  </div>
                  {item.score != null
                    ? <span className={cn("text-xs font-black shrink-0", scoreColor(item.score))}
                        style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{item.score}</span>
                    : item.status === "analyzed"
                    ? <span className="text-xs bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-md font-semibold shrink-0 whitespace-nowrap"
                        title="Цей тип розмови не оцінюється за критеріями Брифування/Презентації КП"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>Без оцінки</span>
                    : <span className="text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-md font-semibold shrink-0 whitespace-nowrap"
                        style={{ fontFamily: "var(--font-unbounded), sans-serif", fontSize: 10 }}>В черзі</span>
                  }
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Score distribution — full width so the zone bars and the "what do
            zones mean" explanation sit side by side instead of stacking the legend
            under a narrow card. */}
        <ScoreDistribution data={stats.scoreDistribution} />

        {/* Row 4: Zone trend + Service breakdown + Kind breakdown — second-tier
            analysis (quality/structure), not as time-sensitive as recent activity above. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <ZoneTrend data={stats.zoneTrend} />

          {/* Service stats */}
          <div className="relative bg-card border border-border rounded-xl p-5">
            <InfoHint text="Розподіл усіх розмов по напрямках агентства (SEO, PPC, GEO тощо) — послуга визначається автоматично під час AI-аналізу. Середній AI-бал — лише по «Брифуванню» та «Презентації КП»." className="absolute top-3 right-3 z-10" />
            <h3 className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>За послугами</h3>
            {stats.serviceStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-3 text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
                  <BarChart2 className="w-5 h-5 text-primary/40" />
                </div>
                <p className="text-xs text-muted-foreground">Немає даних за обраний період</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.serviceStats.map(({ service, count, avgScore }) => {
                  const svcColor = SERVICE_COLORS[service] ?? "#003B29";
                  return (
                  <Link key={service} href={`/conversations?service=${encodeURIComponent(service)}`}
                    className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer">
                    <span className="text-xs font-bold w-24 shrink-0 truncate" title={service} style={{ color: svcColor, fontFamily: "var(--font-unbounded), sans-serif" }}>{service}</span>
                    <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round((count / stats.totalConversations) * 100)}%`, backgroundColor: svcColor }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{count}</span>
                    {avgScore > 0 && (
                      <span className={cn("text-xs font-black w-8 text-right shrink-0", scoreColor(avgScore))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{avgScore}</span>
                    )}
                  </Link>
                  );
                })}
                <p className="text-[11px] text-muted-foreground pt-1">Кількість дзвінків · середній AI-бал</p>
              </div>
            )}
          </div>

          {/* Kind stats */}
          <div className="relative bg-card border border-border rounded-xl p-5">
            <InfoHint text="Розподіл розмов за метою (брифування, фідбек, крос-продаж тощо) — визначається автоматично під час AI-аналізу. Середній AI-бал показано лише для брифування та презентації КП, бо це єдині типи розмов з активними критеріями оцінки." className="absolute top-3 right-3 z-10" />
            <h3 className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>За типом розмови</h3>
            {stats.kindStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-3 text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
                  <BarChart2 className="w-5 h-5 text-primary/40" />
                </div>
                <p className="text-xs text-muted-foreground">Немає даних за обраний період</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.kindStats.map(({ kind, count, avgScore }) => {
                  const kindColor = KIND_COLORS[kind] ?? "#9ca3af";
                  return (
                    <Link key={kind} href={`/conversations?kind=${encodeURIComponent(kind)}`}
                      className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer">
                      <span className="font-bold w-[132px] shrink-0 truncate" title={kind} style={{ color: kindColor, fontFamily: "var(--font-unbounded), sans-serif", fontSize: 11 }}>{kind}</span>
                      <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round((count / stats.totalConversations) * 100)}%`, backgroundColor: kindColor }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{count}</span>
                      {avgScore > 0 && (
                        <span className={cn("text-xs font-black w-8 text-right shrink-0", scoreColor(avgScore))} style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{avgScore}</span>
                      )}
                    </Link>
                  );
                })}
                <p className="text-[11px] text-muted-foreground pt-1">Кількість розмов · середній AI-бал (де застосовно)</p>
              </div>
            )}
          </div>

        </div>

        {/* Row 5: Manager score trend + Top managers — thematic pair (current ranking
            next to its historical trend). The chart fills whatever height the grid
            gives it (see ManagerTrendChart), so this works at any screen width. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col">
            <ManagerTrendChart managers={managers} />
          </div>

          {/* Top managers */}
          <div className="relative bg-card border border-border rounded-xl p-5">
            <InfoHint text="Рейтинг менеджерів за середнім AI-балом за обраний період — всі типи зустрічей." className="absolute top-3 right-3 z-10" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Топ менеджери</h3>
              <Link href="/team" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                Всі <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {stats.topManagers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                <p className="text-xs text-muted-foreground">Немає даних за цей період</p>
              </div>
            ) : (
              <div className="space-y-1">
                {stats.topManagers.map((mgr, i) => (
                  <Link key={mgr.id} href={`/team/${generateSlug(mgr.name)}`}
                    className="flex items-center gap-2.5 hover:bg-secondary/60 -mx-2 px-2 py-2 rounded-lg transition-colors group">
                    <RankBadge rank={i + 1} />
                    <ManagerAvatar name={mgr.name} avatarUrl={mgr.avatar_url} className="w-7 h-7 rounded-lg text-xs shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {mgr.name.split(" ")[0]}&nbsp;
                        <span className="font-normal text-muted-foreground">{mgr.name.split(" ").slice(1).join(" ")}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{mgr.total} розмов</p>
                    </div>
                    <span className={cn("text-sm font-black shrink-0", scoreColor(mgr.score))}
                      style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{mgr.score || "—"}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
