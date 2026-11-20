// How tasks repeat, in words, and when a certain-days task is next on.
import { Moon, Sun, Sunrise } from "lucide-react";
import type { MyTaskRow, TaskRepeat, TimeOfDay } from "./database.types";

export const WEEKDAYS = [
  { iso: 1, short: "Mon", letter: "M" },
  { iso: 2, short: "Tue", letter: "T" },
  { iso: 3, short: "Wed", letter: "W" },
  { iso: 4, short: "Thu", letter: "T" },
  { iso: 5, short: "Fri", letter: "F" },
  { iso: 6, short: "Sat", letter: "S" },
  { iso: 7, short: "Sun", letter: "S" },
] as const;

export const REPEATS: { id: TaskRepeat; label: string }[] = [
  { id: "once", label: "One-off" },
  { id: "daily", label: "Every day" },
  { id: "days", label: "On certain days" },
  { id: "times_per_week", label: "Some times a week" },
  { id: "weekly", label: "Every week" },
  { id: "times_per_month", label: "Some times a month" },
  { id: "monthly", label: "Every month" },
  { id: "quarterly", label: "Every quarter" },
  { id: "yearly", label: "Every year" },
];

/** Most times a week / month (same limits as the database). */
export const MAX_TIMES: Record<"times_per_week" | "times_per_month", number> = { times_per_week: 7, times_per_month: 31 };

/** "Mon, Wed & Fri", "Weekdays", "Weekends", "Every day". */
export function describeWeekdays(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "6,7") return "Weekends";
  const names = set.map((d) => WEEKDAYS[d - 1].short);
  if (names.length === 1) return `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][set[0] - 1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

type Schedule = Pick<MyTaskRow, "repeat" | "weekdays" | "times_per_period">;

/** How a task repeats, e.g. "Daily", "Mon, Wed & Fri", "3× a week". */
export function describeSchedule(t: Schedule): string {
  switch (t.repeat) {
    case "once": return "One-off";
    case "daily": return "Daily";
    case "weekly": return "Weekly";
    case "monthly": return "Monthly";
    case "quarterly": return "Quarterly";
    case "yearly": return "Yearly";
    case "days": return describeWeekdays(t.weekdays ?? []);
    case "times_per_week": return `${t.times_per_period}× a week`;
    case "times_per_month": return `${t.times_per_period}× a month`;
  }
}

const PERIOD_WORD: Partial<Record<TaskRepeat, string>> = {
  weekly: "this week", times_per_week: "this week", monthly: "this month", times_per_month: "this month",
  quarterly: "this quarter", yearly: "this year",
};

/** Progress text, e.g. "1 of 3 this week", "Done this month", "Done today". */
export function describeProgress(
  t: Schedule & Pick<MyTaskRow, "done" | "done_today" | "period_count" | "period_target"> & { times_of_day?: TimeOfDay[] | null },
): string | null {
  if (t.times_of_day && t.times_of_day.length > 0) return `${t.period_count} of ${t.period_target} today`;
  if (t.repeat === "times_per_week" || t.repeat === "times_per_month") {
    return `${t.period_count} of ${t.period_target} ${PERIOD_WORD[t.repeat]}`;
  }
  if (!t.done) return null;
  if (t.repeat === "once") return "Done";
  if (t.repeat === "daily" || t.repeat === "days") return "Done today";
  return `Done ${PERIOD_WORD[t.repeat]}`;
}

/** ISO weekday (1 = Mon) of a YYYY-MM-DD date. */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Days until a certain-days task is next on, counting from `today` (0 = today). */
export function daysUntilNext(weekdays: number[], today: string): number {
  const now = isoWeekday(today);
  for (let i = 0; i < 7; i++) if (weekdays.includes(((now - 1 + i) % 7) + 1)) return i;
  return 7;
}

export function describeNext(weekdays: number[], today: string): string {
  const n = daysUntilNext(weekdays, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][((isoWeekday(today) - 1 + n) % 7)];
}

/** Times of day a daily task can be checked off at, in order. */
export const TIMES_OF_DAY: { id: TimeOfDay; label: string; Icon: typeof Sun }[] = [
  { id: "morning", label: "Morning", Icon: Sunrise },
  { id: "afternoon", label: "Afternoon", Icon: Sun },
  { id: "night", label: "Night", Icon: Moon },
];
