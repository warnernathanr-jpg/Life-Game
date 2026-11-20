// Which tasks fall on which day, for the Tasks calendar (day, week and month views).
//   * one-off with a due date: on that day (and, while not done, carried to today once it's overdue);
//   * one-off without a date: on today only, while not done;
//   * daily: every day from the day it was added;
//   * certain days: on those weekdays;
//   * weekly / N× a week / monthly / N× a month / quarterly / yearly: "any day" in their period, listed separately.
import type { MyTaskRow } from "./database.types";
import { addDays } from "./habits";
import { isoWeekday } from "./tasks";

export type CalendarView = "day" | "week" | "month";

type T = Pick<MyTaskRow, "id" | "repeat" | "weekdays" | "due_date" | "created_at" | "done">;

/** Flexible tasks: done any day in their period, not on a set day. */
export const isFlexible = (t: Pick<T, "repeat">) => !["once", "daily", "days"].includes(t.repeat);

/** The local day a task was added (close enough: the server's date of created_at). */
const addedOn = (t: T) => t.created_at.slice(0, 10);

/** Whether a task has a set place on this day. `doneDays` are the days it was checked off. */
export function isOnDay(t: T, day: string, today: string, doneDays: Set<string>): boolean {
  switch (t.repeat) {
    case "once":
      if (t.due_date) {
        if (t.due_date === day) return true;
        // An overdue one-off that isn't done shows on today (and the day it was finished, if it was finished late).
        return day === today && t.due_date < today && !t.done;
      }
      // No date: on today while it's open, or on the day it was done.
      return doneDays.size > 0 ? doneDays.has(day) : day === today;
    case "daily":
      return day >= addedOn(t) || doneDays.has(day);
    case "days":
      return (t.weekdays ?? []).includes(isoWeekday(day)) && (day >= addedOn(t) || doneDays.has(day));
    default:
      return false;
  }
}

/** Monday of the ISO week holding `day`. */
export function weekStart(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** The days a view shows around `day`: 1 day, Mon–Sun, or the month's weeks (Mon-first grid, may include edge days). */
export function viewDays(view: CalendarView, day: string): string[] {
  if (view === "day") return [day];
  if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
  const first = `${day.slice(0, 7)}-01`;
  const start = weekStart(first);
  const nextMonth = shiftMonth(first, 1);
  const out: string[] = [];
  for (let d = start; d < nextMonth || isoWeekday(d) !== 1; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Same day-of-month `n` months away (clamped to the month's last day). */
export function shiftMonth(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** The date the ‹ / › buttons go to. */
export function stepDate(view: CalendarView, day: string, dir: 1 | -1): string {
  if (view === "day") return addDays(day, dir);
  if (view === "week") return addDays(day, 7 * dir);
  return shiftMonth(day, dir);
}

const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** "Today", "Tomorrow", "Yesterday" or "Fri, Nov 21". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return fmt(day, { weekday: "short", month: "short", day: "numeric", ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

/** The heading for a view: "Fri, Nov 21", "Nov 17 – 23", "Nov 30 – Dec 6", "November 2026". */
export function viewTitle(view: CalendarView, day: string): string {
  if (view === "day") return fmt(day, { weekday: "long", month: "long", day: "numeric" });
  if (view === "month") return fmt(day, { month: "long", year: "numeric" });
  const a = weekStart(day);
  const b = addDays(a, 6);
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${fmt(a, { month: "short", day: "numeric" })} – ${Number(b.slice(8))}`
    : `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(b, { month: "short", day: "numeric" })}`;
}

/** "Due today", "Due tomorrow", "Due Fri, Nov 21", "Overdue (Nov 18)". */
export function describeDue(due: string, today: string): string {
  if (due < today) return `Overdue (${fmt(due, { month: "short", day: "numeric" })})`;
  if (due === today) return "Due today";
  if (due === addDays(today, 1)) return "Due tomorrow";
  return `Due ${dayLabel(due, today)}`;
}
