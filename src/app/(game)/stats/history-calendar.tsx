"use client";

import { AreaIcon } from "@/components/icons";

import Link from "next/link";
import { useState } from "react";
import type { LifeArea } from "@/lib/database.types";
import { AREAS } from "@/lib/game";

export type DoneItem = { day: string; title: string; area: LifeArea; time: string };

/** Dot colors per life area (each area also shows its icon in the day list, so color isn't the only cue). */
const AREA_DOT: Record<LifeArea, string> = {
  health: "bg-rose-400",
  work: "bg-sky-400",
  knowledge: "bg-amber-400",
  personal: "bg-emerald-400",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** A month of completed tasks: dots per day by life area; tap a day to see what was done. */
export function HistoryCalendar({ month, today, items }: { month: string; today: string; items: DoneItem[] }) {
  const byDay = new Map<string, DoneItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const inMonth = today.startsWith(month);
  const firstWithItems = [...byDay.keys()].sort()[0];
  const [selected, setSelected] = useState<string>(inMonth ? today : (firstWithItems ?? `${month}-01`));

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const selectedItems = byDay.get(selected) ?? [];
  const nextMonth = addMonths(month, 1);
  const total = items.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/stats?month=${addMonths(month, -1)}`} scroll={false} className="btn-secondary min-h-9 px-3 py-1" aria-label="Previous month">‹</Link>
        <div className="text-center">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted">{total} task{total === 1 ? "" : "s"} completed</p>
        </div>
        {today.slice(0, 7) >= nextMonth ? (
          <Link href={`/stats?month=${nextMonth}`} scroll={false} className="btn-secondary min-h-9 px-3 py-1" aria-label="Next month">›</Link>
        ) : (
          <span className="min-h-9 w-11" aria-hidden />
        )}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted" aria-hidden>
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`Completed tasks in ${title}`}>
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const list = byDay.get(day) ?? [];
          const isSel = day === selected;
          const isToday = day === today;
          const future = day > today;
          const areas = [...new Set(list.map((it) => it.area))];
          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => setSelected(day)}
              aria-pressed={isSel}
              aria-label={`${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}: ${list.length} task${list.length === 1 ? "" : "s"}`}
              className={`flex aspect-square min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-sm ${
                isSel ? "bg-accent text-on-accent" : list.length ? "bg-raised hover:bg-line" : "hover:bg-raised"
              } ${isToday && !isSel ? "ring-2 ring-accent" : ""} ${future ? "opacity-30" : ""}`}
            >
              <span className="tabular-nums leading-none">{Number(day.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden>
                {areas.map((a) => <span key={a} className={`size-1.5 rounded-full ${AREA_DOT[a]}`} />)}
              </span>
            </button>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Life areas">
        {AREAS.map((a) => (
          <li key={a.id} className="flex items-center gap-1"><span className={`size-2 rounded-full ${AREA_DOT[a.id]}`} aria-hidden />{a.label}</li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-semibold">
          {new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
        </p>
        {selectedItems.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing completed this day.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line">
            {selectedItems.map((it, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
                <AreaIcon area={it.area} className="size-4 text-muted" />
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{it.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
