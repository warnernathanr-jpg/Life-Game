// Gentle habit tracking: how consistent you've been lately, never a streak that resets to zero.
// Everything here is display-only; coins and milestones are decided by the database.
import type { TaskRepeat } from "./database.types";

export type HabitTask = {
  repeat: TaskRepeat;
  weekdays: number[] | null;
  times_per_period: number | null;
  created_at: string; // ISO timestamp
};

/** YYYY-MM-DD plus n days (calendar arithmetic in UTC, safe for plain dates). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** Habits are recurring tasks that repeat often enough to show a rhythm. */
export function isHabit(t: Pick<HabitTask, "repeat">): boolean {
  return t.repeat === "daily" || t.repeat === "days" || t.repeat === "times_per_week" || t.repeat === "times_per_month";
}

function scheduledOn(t: HabitTask, day: string): boolean {
  if (t.repeat === "daily") return true;
  if (t.repeat === "days") return (t.weekdays ?? []).includes(isoWeekday(day));
  return false;
}

export type HabitSummary = {
  /** Last 7 days, oldest first: scheduled (for daily/days tasks) and done. */
  week: { day: string; scheduled: boolean; done: boolean }[];
  /** Friendly line, e.g. "5 of the last 7 days" or "3 of 3 this week". */
  line: string;
  /** Share of recent opportunities done, 0–1 (over up to 4 weeks, only since the task was created). */
  rate: number;
};

/**
 * Summarise a habit from the days it was done (local YYYY-MM-DD) and today's date in the user's time zone.
 * Missed days lower the rate a little; nothing ever resets.
 */
export function summarizeHabit(t: HabitTask, doneDays: Iterable<string>, today: string): HabitSummary {
  const done = new Set(doneDays);
  const created = t.created_at.slice(0, 10);
  const start28 = addDays(today, -27) > created ? addDays(today, -27) : created;

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const exists = day >= created;
    const scheduled = exists && (t.repeat === "times_per_week" || t.repeat === "times_per_month" ? true : scheduledOn(t, day));
    return { day, scheduled, done: done.has(day) };
  });

  if (t.repeat === "daily" || t.repeat === "days") {
    const last7 = week.filter((d) => d.scheduled);
    const hits7 = last7.filter((d) => d.done).length;
    let possible = 0;
    let hits = 0;
    for (let day = start28; day <= today; day = addDays(day, 1)) {
      if (!scheduledOn(t, day)) continue;
      // Today only counts once it's done, so an unfinished today never lowers the rate.
      if (day === today && !done.has(day)) continue;
      possible++;
      if (done.has(day)) hits++;
    }
    const unit = t.repeat === "daily" ? "days" : "scheduled days";
    const line = last7.length === 0 ? "Starts this week" : `${hits7} of the last ${last7.length} ${unit}`;
    return { week, line, rate: possible ? hits / possible : 0 };
  }

  const target = Math.max(1, t.times_per_period ?? 1);
  if (t.repeat === "times_per_week") {
    const thisWeek = mondayOf(today);
    const count = (from: string) => [...done].filter((d) => d >= from && d < addDays(from, 7)).length;
    let possible = 0;
    let hits = 0;
    for (let w = 0; w < 4; w++) {
      const from = addDays(thisWeek, -7 * w);
      if (addDays(from, 6) < created) break;
      const c = Math.min(target, count(from));
      if (w === 0) {
        // The current week counts only what's done so far, so an unfinished week never lowers the rate.
        possible += c;
      } else {
        possible += target;
      }
      hits += c;
    }
    return { week, line: `${Math.min(target, count(thisWeek))} of ${target} this week`, rate: possible ? hits / possible : 0 };
  }

  // times_per_month
  const monthStart = `${today.slice(0, 7)}-01`;
  const thisMonth = [...done].filter((d) => d >= monthStart && d <= today).length;
  return { week, line: `${Math.min(target, thisMonth)} of ${target} this month`, rate: target ? Math.min(1, thisMonth / target) : 0 };
}

/** Encouraging words for a consistency rate. */
export function rateWords(rate: number): string {
  if (rate >= 0.85) return "Rock solid";
  if (rate >= 0.6) return "Steady";
  if (rate >= 0.3) return "Building up";
  return "Getting started";
}
