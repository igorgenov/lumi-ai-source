"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

interface Props {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  placeholder?: string;
  align?: "left" | "right";
}

const MONTHS_UA = [
  "Січень","Лютий","Березень","Квітень","Травень","Червень",
  "Липень","Серпень","Вересень","Жовтень","Листопад","Грудень",
];
const DAYS_UA = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

const PRESETS: { label: string; getRange: () => DateRange; custom?: boolean }[] = [
  {
    label: "Сьогодні",
    getRange: () => { const n = startOf(new Date()); return { from: n, to: n }; },
  },
  {
    label: "Вчора",
    getRange: () => { const n = startOf(new Date()); n.setDate(n.getDate() - 1); return { from: n, to: n }; },
  },
  {
    label: "Останні 7 днів",
    getRange: () => { const to = startOf(new Date()); const from = new Date(to); from.setDate(to.getDate() - 6); return { from, to }; },
  },
  {
    label: "Поточний тиждень",
    getRange: () => { const n = new Date(); const mon = startOf(new Date(n)); mon.setDate(n.getDate() - ((n.getDay()+6)%7)); const to = startOf(new Date()); return { from: mon, to }; },
  },
  {
    label: "Минулий тиждень",
    getRange: () => { const n = new Date(); const mon = startOf(new Date(n)); mon.setDate(n.getDate() - ((n.getDay()+6)%7) - 7); const sun = new Date(mon); sun.setDate(mon.getDate()+6); return { from: mon, to: sun }; },
  },
  {
    label: "Останні 30 днів",
    getRange: () => { const to = startOf(new Date()); const from = new Date(to); from.setDate(to.getDate() - 29); return { from, to }; },
  },
  {
    label: "Поточний місяць",
    getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: startOf(new Date()) }; },
  },
  {
    label: "Минулий місяць",
    getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth()-1, 1), to: new Date(n.getFullYear(), n.getMonth(), 0) }; },
  },
  {
    label: "Поточний квартал",
    getRange: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); return { from: new Date(n.getFullYear(), q*3, 1), to: startOf(new Date()) }; },
  },
  { label: "Діапазон дат", getRange: () => ({ from: null, to: null }), custom: true },
];

function startOf(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }

function fmt(d: Date | null) {
  if (!d) return "";
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = String(d.getFullYear()).slice(2);
  return `${day}.${month}.${year}`;
}

export function currentWeekRange(): DateRange {
  const n = new Date();
  const mon = new Date(n);
  mon.setDate(n.getDate() - ((n.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: mon, to: sun };
}

export function currentMonthRange(): DateRange {
  const n = new Date();
  const first = new Date(n.getFullYear(), n.getMonth(), 1);
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  last.setHours(23, 59, 59, 999);
  return { from: first, to: last };
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function inRange(d: Date, from: Date | null, to: Date | null) {
  if (!from || !to) return false;
  const t = d.getTime();
  return t >= startOf(from).getTime() && t <= startOf(to).getTime();
}

function CalGrid({
  month, year, from, to, hovering, onSelect, onHover,
}: {
  month: number; year: number;
  from: Date | null; to: Date | null; hovering: Date | null;
  onSelect: (d: Date) => void;
  onHover: (d: Date | null) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  const startDow = (firstDay.getDay()+6)%7;
  const today = startOf(new Date());

  const cells: (Date|null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

  const hoverEnd = hovering && from && !to ? hovering : null;

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_UA.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isFrom  = from && isSameDay(d, from);
          const isTo    = to   && isSameDay(d, to);
          const isEnd   = hoverEnd && isSameDay(d, hoverEnd);
          const inR     = inRange(d, from, to || hoverEnd);
          const isToday = isSameDay(d, today);

          return (
            <button
              key={i}
              onClick={() => onSelect(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "relative h-7 w-full text-[11px] transition-colors rounded-none",
                inR && !isFrom && !isTo && "bg-emerald-100 dark:bg-emerald-500/15 text-primary",
                isFrom && "bg-primary text-white font-bold rounded-l-md",
                (isTo || (isEnd && !to)) && "bg-primary text-white font-bold rounded-r-md",
                !isFrom && !isTo && !inR && !isEnd && isToday && "font-bold text-primary",
                !isFrom && !isTo && !inR && !isEnd && !isToday && "text-foreground hover:bg-secondary",
              )}
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
            >
              {d.getDate()}
              {isToday && !isFrom && !isTo && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({ value, onChange, placeholder = "Оберіть період", align = "left" }: Props) {
  const [open, setOpen]       = useState(false);
  const [range, setRange]     = useState<DateRange>(value ?? { from: null, to: null });
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hovering, setHovering]         = useState<Date | null>(null);

  const today = new Date();
  const [leftMonth, setLeftMonth] = useState(today.getMonth());
  const [leftYear,  setLeftYear]  = useState(today.getFullYear());
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;
  const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;

  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 620;
      const sidebarW = 240;
      const left = Math.max(sidebarW + 8, Math.min(rect.right - dropW, window.innerWidth - dropW - 8));
      setDropdownPos({ top: rect.bottom + 6, left });
    }
  }, [open]);

  function selectPreset(idx: number) {
    const p = PRESETS[idx];
    setActivePreset(idx);
    if (p.custom) {
      setRange({ from: null, to: null });
      return;
    }
    const r = p.getRange();
    setRange(r);
    onChange?.(r);
    setOpen(false);
  }

  function handleDayClick(d: Date) {
    if (!range.from || (range.from && range.to)) {
      setRange({ from: startOf(d), to: null });
      setActivePreset(PRESETS.length - 1);
    } else {
      const newTo = startOf(d);
      const from  = range.from;
      const r = newTo < from ? { from: newTo, to: from } : { from, to: newTo };
      setRange(r);
    }
  }

  function applyCustom() {
    onChange?.(range);
    setOpen(false);
  }

  function prevMonth() {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y - 1); }
    else setLeftMonth(m => m - 1);
  }
  function nextMonth() {
    if (leftMonth === 11) { setLeftMonth(0); setLeftYear(y => y + 1); }
    else setLeftMonth(m => m + 1);
  }

  function clear() {
    const r = { from: null, to: null };
    setRange(r);
    setActivePreset(null);
    onChange?.(r);
  }

  const hasValue = range.from || range.to;
  const isCustom = activePreset === PRESETS.length - 1;

  const displayLabel = (() => {
    if (range.from && range.to) return `${fmt(range.from)} — ${fmt(range.to)}`;
    if (range.from) return `З ${fmt(range.from)}…`;
    return null;
  })();

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors bg-card",
          open || hasValue
            ? "border-primary/40 text-primary"
            : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
        )}
        style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span>{displayLabel ?? placeholder}</span>
        {hasValue && (
          <span
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="ml-1 text-muted-foreground hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Dropdown — rendered via portal to escape overflow/stacking contexts */}
      {open && dropdownPos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-hidden flex"
          style={{ width: 620, top: dropdownPos.top, left: dropdownPos.left }}
        >
          {/* Presets column */}
          <div className="w-44 border-r border-border p-2 shrink-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5 mb-1"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>Швидкий вибір</p>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => selectPreset(i)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                  activePreset === i
                    ? "bg-primary text-white font-bold"
                    : "text-foreground hover:bg-secondary"
                )}
                style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: activePreset === i ? 700 : 400 }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar — always visible */}
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth}
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-10 text-xs font-bold text-primary"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <span>{MONTHS_UA[leftMonth]} {leftYear}</span>
                <span>{MONTHS_UA[rightMonth]} {rightYear}</span>
              </div>
              <button onClick={nextMonth}
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <CalGrid
                  month={leftMonth} year={leftYear}
                  from={range.from} to={range.to} hovering={hovering}
                  onSelect={handleDayClick} onHover={setHovering}
                />
              </div>
              <div className="w-px bg-border shrink-0" />
              <div className="flex-1">
                <CalGrid
                  month={rightMonth} year={rightYear}
                  from={range.from} to={range.to} hovering={hovering}
                  onSelect={handleDayClick} onHover={setHovering}
                />
              </div>
            </div>

            {/* Footer — shown when in custom mode or a day is picked */}
            {(isCustom || range.from) && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  {range.from && !range.to && "Оберіть дату завершення"}
                  {range.from && range.to && (
                    <span className="text-primary font-semibold" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                      {fmt(range.from)} — {fmt(range.to)}
                    </span>
                  )}
                  {!range.from && "Оберіть дату початку"}
                </div>
                <div className="flex gap-2">
                  <button onClick={clear}
                    className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-primary transition-colors bg-card"
                    style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 600 }}>
                    Скинути
                  </button>
                  <button
                    disabled={!range.from || !range.to}
                    onClick={applyCustom}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-lg transition-colors",
                      range.from && range.to
                        ? "bg-primary text-white hover:bg-primary-hover"
                        : "bg-secondary text-muted-foreground cursor-not-allowed"
                    )}
                    style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: 700 }}
                  >
                    Застосувати
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
