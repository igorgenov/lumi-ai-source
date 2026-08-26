"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS_UA = [
  "Січень","Лютий","Березень","Квітень","Травень","Червень",
  "Липень","Серпень","Вересень","Жовтень","Листопад","Грудень",
];
const DAYS_UA = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

function startOf(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function toISO(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function fromISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function fmtFull(d: Date) {
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
}

// Single-date picker matching the visual style of DateRangePicker (components/ui/date-range-picker.tsx),
// for form fields bound to a plain ISO string instead of a range.
export function DatePicker({ value, onChange, placeholder = "Оберіть дату", className }: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const today = new Date();
  const [month, setMonth] = useState(selected?.getMonth() ?? today.getMonth());
  const [year, setYear] = useState(selected?.getFullYear() ?? today.getFullYear());

  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
    if (!open) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 280;
      // Calendar is ~340px tall (header + weekday row + up to 6 week rows + padding).
      // Opening downward unconditionally could push most of it past the viewport
      // bottom (confirmed 2026-07-28 on the Коучинг page, where the field sits low
      // on the screen) — flip to open upward when there isn't room below but there
      // is above.
      const dropH = 340;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropH + 8 && rect.top > dropH + 8;
      const top = openUp ? rect.top - dropH - 6 : rect.bottom + 6;
      setPos({ top, left });
    }
    const d = selected ?? today;
    setMonth(d.getMonth());
    setYear(d.getFullYear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function select(d: Date) {
    onChange(toISO(d));
    setOpen(false);
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  const todayStart = startOf(today);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors bg-card text-left",
          open || selected ? "border-primary/40" : "border-border hover:border-primary/30"
        )}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", selected ? "text-foreground" : "text-muted-foreground")}>
          {selected ? fmtFull(selected) : placeholder}
        </span>
        {selected && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="ml-auto shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg p-3"
          style={{ width: 280, top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {MONTHS_UA[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS_UA.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isSelected = selected && isSameDay(d, selected);
              const isToday = isSameDay(d, todayStart);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => select(d)}
                  className={cn(
                    "relative h-7 w-full text-[11px] rounded-md transition-colors",
                    isSelected ? "bg-primary text-white font-bold" : isToday ? "font-bold text-primary" : "text-foreground hover:bg-secondary"
                  )}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <button type="button" onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-red-500 transition-colors">
              Скинути
            </button>
            <button type="button" onClick={() => select(today)} className="text-xs text-primary font-semibold hover:text-primary-hover transition-colors">
              Сьогодні
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function splitDateTime(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const [date, time] = v.split("T");
  return { date: date ?? "", time: time ?? "" };
}

// Same calendar as DatePicker, plus a time row — for fields bound to a
// datetime-local-style string ("yyyy-MM-ddTHH:mm") instead of a bare date.
export function DateTimePicker({ value, onChange, placeholder = "Оберіть дату й час", className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { date: dateStr, time: timeStr } = splitDateTime(value);
  const [open, setOpen] = useState(false);
  const selected = fromISO(dateStr);
  const today = new Date();
  const [month, setMonth] = useState(selected?.getMonth() ?? today.getMonth());
  const [year, setYear] = useState(selected?.getFullYear() ?? today.getFullYear());

  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
    if (!open) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 280;
      // Calendar is ~340px tall (header + weekday row + up to 6 week rows + padding).
      // Opening downward unconditionally could push most of it past the viewport
      // bottom (confirmed 2026-07-28 on the Коучинг page, where the field sits low
      // on the screen) — flip to open upward when there isn't room below but there
      // is above.
      const dropH = 340;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropH + 8 && rect.top > dropH + 8;
      const top = openUp ? rect.top - dropH - 6 : rect.bottom + 6;
      setPos({ top, left });
    }
    const d = selected ?? today;
    setMonth(d.getMonth());
    setYear(d.getFullYear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selectDay(d: Date) {
    onChange(`${toISO(d)}T${timeStr || "00:00"}`);
  }

  function changeTime(t: string) {
    onChange(`${dateStr || toISO(today)}T${t}`);
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  const todayStart = startOf(today);

  const label = selected
    ? `${fmtFull(selected)}${timeStr ? `, ${timeStr}` : ""}`
    : placeholder;

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors bg-card text-left",
          open || selected ? "border-primary/40" : "border-border hover:border-primary/30"
        )}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", selected ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg p-3"
          style={{ width: 280, top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-primary" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              {MONTHS_UA[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS_UA.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isSelected = selected && isSameDay(d, selected);
              const isToday = isSameDay(d, todayStart);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(d)}
                  className={cn(
                    "relative h-7 w-full text-[11px] rounded-md transition-colors",
                    isSelected ? "bg-primary text-white font-bold" : isToday ? "font-bold text-primary" : "text-foreground hover:bg-secondary"
                  )}
                  style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
            <label className="text-xs text-muted-foreground shrink-0">Час:</label>
            <input
              type="time"
              value={timeStr || "00:00"}
              onChange={e => changeTime(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30 bg-card text-foreground"
            />
            <button type="button" onClick={() => onChange(`${toISO(today)}T${String(today.getHours()).padStart(2,"0")}:${String(today.getMinutes()).padStart(2,"0")}`)}
              className="text-xs text-primary font-semibold hover:text-primary-hover transition-colors shrink-0">
              Зараз
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
