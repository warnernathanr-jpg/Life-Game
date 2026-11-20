// The Tasks calendar: a date bar (Day / Week / Month, ‹ › and Today) and the day, week and month views.
// Server-rendered: every control is a link (?view=…&date=…). Checking off happens on today's list.
import { Check, ChevronLeft, ChevronRight, Circle, Repeat } from "lucide-react";
import Link from "next/link";
import { ItemIcon } from "@/components/icons";
import type { LifeArea, MyTaskRow } from "@/lib/database.types";
import { type CalendarView, dayLabel, describeDue, isFlexible, isOnDay, stepDate, viewDays, viewTitle } from "@/lib/task-calendar";
import { describeSchedule } from "@/lib/tasks";

const href = (view: CalendarView, date: string, today: string) =>
  view === "day" && date === today ? "/tasks" : `/tasks?view=${view}&date=${date}`;

const AREA_DOT: Record<LifeArea, string> = {
  health: "bg-rose-400",
  work: "bg-sky-400",
  knowledge: "bg-amber-400",
  personal: "bg-emerald-400",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarBar({ view, date, today }: { view: CalendarView; date: string; today: string }) {
  const showingToday = viewDays(view, date).includes(today);
  return (
    <nav aria-label="Calendar" className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-raised p-0.5 text-sm" role="tablist" aria-label="View">
        {(["day", "week", "month"] as const).map((v) => (
          <Link
            key={v}
            href={href(v, date, today)}
            role="tab"
            aria-selected={view === v}
            className={`min-h-9 rounded-md px-3 py-1.5 font-medium capitalize ${view === v ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
          >
            {v}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Link href={href(view, stepDate(view, date, -1), today)} aria-label={`Previous ${view}`} className="flex size-9 items-center justify-center rounded-lg hover:bg-raised">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
          {view === "day" ? dayLabel(date, today) : viewTitle(view, date)}
        </span>
        <Link href={href(view, stepDate(view, date, 1), today)} aria-label={`Next ${view}`} className="flex size-9 items-center justify-center rounded-lg hover:bg-raised">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
      {/* Always takes its space (hidden while today is shown) so nothing shifts when flipping days. */}
      <Link
        href={href(view, today, today)}
        aria-hidden={showingToday || undefined}
        tabIndex={showingToday ? -1 : undefined}
        className={`btn-secondary min-h-9 px-3 py-1 text-sm ${showingToday ? "invisible" : ""}`}
      >
        Today
      </Link>
    </nav>
  );
}

type Done = Map<string, Set<string>>; // task id → days checked off

function dayItems(tasks: MyTaskRow[], day: string, today: string, done: Done) {
  return tasks.filter((t) => isOnDay(t, day, today, done.get(t.id) ?? new Set()));
}

function TaskLine({ task, day, today, done, compact }: { task: MyTaskRow; day: string; today: string; done: Done; compact?: boolean }) {
  const isDone = done.get(task.id)?.has(day) ?? false;
  const future = day > today;
  return (
    <li className={`flex items-center gap-2 ${compact ? "py-1 text-sm" : "px-4 py-3 sm:px-5"}`}>
      <span
        aria-label={isDone ? "Done" : future ? "Planned" : "Not done"}
        className={`flex shrink-0 items-center justify-center rounded-full ${compact ? "size-4" : "size-7"} ${isDone ? "bg-good text-bg" : "border border-line text-faint"}`}
      >
        {isDone ? <Check className={compact ? "size-3" : "size-4"} strokeWidth={3} aria-hidden /> : null}
      </span>
      {compact ? (
        <ItemIcon icon={task.icon} area={task.area} className="size-3.5 shrink-0 text-accent-text" aria-hidden />
      ) : (
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-raised text-accent-text">
          <ItemIcon icon={task.icon} area={task.area} className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block break-words ${compact ? "" : "font-medium"} ${isDone ? "text-muted line-through" : ""}`}>{task.title}</span>
        {!compact && (
          <span className="block text-xs text-muted">
            {task.repeat === "once" ? (task.due_date ? describeDue(task.due_date, today) : "One-off") : describeSchedule(task)}
          </span>
        )}
      </span>
      {!compact && <span className="shrink-0 rounded-full bg-coin-soft px-2 py-0.5 text-xs font-bold text-coin">+{task.reward}</span>}
    </li>
  );
}

/** Weekly, monthly… tasks: any day in their period, with how many times they were done in the days shown. */
function FlexibleList({ tasks, days, done, title }: { tasks: MyTaskRow[]; days: string[]; done: Done; title: string }) {
  const flex = tasks.filter(isFlexible);
  if (flex.length === 0) return null;
  return (
    <section className="card p-0 sm:p-0" aria-labelledby="flex-h">
      <h2 id="flex-h" className="flex items-center gap-2 px-4 pt-4 font-semibold sm:px-5">
        <Repeat className="size-4 text-muted" aria-hidden /> {title}
      </h2>
      <ul className="divide-y divide-line">
        {flex.map((t) => {
          const n = days.filter((d) => done.get(t.id)?.has(d)).length;
          return (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-raised text-accent-text">
                <ItemIcon icon={t.icon} area={t.area} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{t.title}</span>
                <span className="block text-xs text-muted">{describeSchedule(t)}{n > 0 ? ` · done ${n}× in these days` : ""}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DayView({ tasks, date, today, done }: { tasks: MyTaskRow[]; date: string; today: string; done: Done }) {
  const items = dayItems(tasks, date, today, done);
  const note = date > today ? "Planned for this day. You can check tasks off on the day itself." : "What was on this day.";
  return (
    <div className="space-y-4">
      {/* Same spacer as today's list (where check-off messages appear), so the cards line up when flipping days. */}
      <p className="min-h-5 text-sm" aria-hidden />
      <section className="card p-0 sm:p-0" aria-labelledby="day-h">
        <h2 id="day-h" className="px-4 pt-4 font-semibold sm:px-5">{viewTitle("day", date)}</h2>
        <p className="px-4 text-xs text-muted sm:px-5">{note}</p>
        {items.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted sm:px-5">Nothing set for this day.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((t) => <TaskLine key={t.id} task={t} day={date} today={today} done={done} />)}
          </ul>
        )}
      </section>
      <FlexibleList tasks={tasks} days={[date]} done={done} title="Any day (weekly, monthly…)" />
    </div>
  );
}

export function WeekView({ tasks, date, today, done }: { tasks: MyTaskRow[]; date: string; today: string; done: Done }) {
  const days = viewDays("week", date);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
        {days.map((d, i) => {
          const items = dayItems(tasks, d, today, done);
          return (
            <section key={d} className={`card p-3 lg:min-h-48 ${d === today ? "ring-2 ring-accent" : ""}`} aria-label={viewTitle("day", d)}>
              <Link href={href("day", d, today)} className="flex items-baseline justify-between gap-2 hover:text-accent-text">
                <span className="text-xs font-semibold uppercase text-muted">{WEEKDAYS[i]}</span>
                <span className={`text-lg font-bold ${d === today ? "text-accent-text" : ""}`}>{Number(d.slice(8))}</span>
              </Link>
              {items.length === 0 ? (
                <p className="mt-1 text-xs text-faint">Nothing set</p>
              ) : (
                <ul className="mt-1">
                  {items.map((t) => <TaskLine key={t.id} task={t} day={d} today={today} done={done} compact />)}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <FlexibleList tasks={tasks} days={days} done={done} title="Any day this week (weekly, monthly…)" />
    </div>
  );
}

export function MonthView({ tasks, date, today, done }: { tasks: MyTaskRow[]; date: string; today: string; done: Done }) {
  const days = viewDays("month", date);
  const month = date.slice(0, 7);
  return (
    <div className="space-y-4">
      <div className="card p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted" aria-hidden>
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <ol className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const items = dayItems(tasks, d, today, done);
            const doneN = items.filter((t) => done.get(t.id)?.has(d)).length;
            const inMonth = d.slice(0, 7) === month;
            return (
              <li key={d}>
                <Link
                  href={href("day", d, today)}
                  aria-label={`${viewTitle("day", d)}: ${items.length} task${items.length === 1 ? "" : "s"}${doneN ? `, ${doneN} done` : ""}`}
                  className={`flex min-h-14 flex-col rounded-lg p-1 text-left hover:bg-raised sm:min-h-24 sm:p-1.5 ${inMonth ? "" : "opacity-40"} ${d === today ? "ring-2 ring-accent" : "bg-raised/40"}`}
                >
                  <span className={`text-xs font-semibold ${d === today ? "text-accent-text" : ""}`}>{Number(d.slice(8))}</span>
                  {/* Phones: one dot per task (green when done). Wider: the first titles. */}
                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                    {items.slice(0, 6).map((t) => (
                      <span key={t.id} className={`size-1.5 rounded-full ${done.get(t.id)?.has(d) ? "bg-good" : AREA_DOT[t.area]}`} />
                    ))}
                  </span>
                  <span className="mt-0.5 hidden space-y-0.5 sm:block" aria-hidden>
                    {items.slice(0, 3).map((t) => {
                      const isDone = done.get(t.id)?.has(d);
                      return (
                        <span key={t.id} className={`flex items-center gap-1 truncate text-[11px] leading-tight ${isDone ? "text-muted line-through" : ""}`}>
                          {isDone ? <Check className="size-3 shrink-0 text-good" aria-hidden /> : <Circle className={`size-2 shrink-0 rounded-full ${AREA_DOT[t.area]} text-transparent`} aria-hidden />}
                          <span className="truncate">{t.title}</span>
                        </span>
                      );
                    })}
                    {items.length > 3 && <span className="block text-[11px] text-muted">+{items.length - 3} more</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      <FlexibleList tasks={tasks} days={days.filter((d) => d.slice(0, 7) === month)} done={done} title="Any day this month (weekly, monthly…)" />
    </div>
  );
}

/** The first and last day a view shows (for loading check-offs). */
export function viewRange(view: CalendarView, date: string): [string, string] {
  const days = viewDays(view, date);
  return [days[0], days[days.length - 1]];
}
