import { CoinIcon } from "@/components/icons";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatCoins, nextUnlocks } from "@/lib/game";
import { AreaPoints } from "@/components/area-points";
import { addDays, isHabit, summarizeHabit, type HabitSummary } from "@/lib/habits";
import { daysUntilNext } from "@/lib/tasks";
import { AddTaskForm } from "./add-task-form";
import { TaskList } from "./task-list";
import { CalendarBar, DayView, MonthView, WeekView, viewRange } from "./calendar";
import type { CalendarView } from "@/lib/task-calendar";

export const metadata: Metadata = { title: "Tasks · Life City" };

async function TasksPageContent({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: tasks }, { data: progress }, { data: types }, { data: profile }] = await Promise.all([
    supabase.rpc("my_tasks"),
    supabase.rpc("my_progress").maybeSingle(),
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.from("profiles").select("display_name").maybeSingle(),
  ]);
  const today = tasks?.[0]?.today ?? new Date().toISOString().slice(0, 10);
  // Check-offs from the last 5 weeks, for each habit's recent rhythm.
  const { data: recent } = await supabase
    .from("task_completions")
    .select("task_id, local_day")
    .gte("local_day", addDays(today, -35));
  const view: CalendarView = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : today;
  const calendarOn = !(view === "day" && date === today);
  const done = new Map<string, Set<string>>();
  if (calendarOn) {
    const [from, to] = viewRange(view, date);
    const { data: rows } = await supabase.from("task_completions").select("task_id, local_day").gte("local_day", from).lte("local_day", to);
    for (const r of rows ?? []) if (r.task_id) done.set(r.task_id, (done.get(r.task_id) ?? new Set()).add(r.local_day));
  }
  const daysByTask = new Map<string, string[]>();
  for (const c of recent ?? []) if (c.task_id) daysByTask.set(c.task_id, [...(daysByTask.get(c.task_id) ?? []), c.local_day]);

  const all = tasks ?? [];
  const active = all.filter((t) => !t.archived_at);
  // To do: on today and still needs doing. Done: checked off today, or done earlier this week/month/quarter/year.
  // One-offs due on a later day wait under "Coming up" (they can still be done early).
  const later = (t: (typeof active)[number]) => t.repeat === "once" && !!t.due_date && t.due_date > today && !t.done;
  const todo = active
    .filter((t) => t.scheduled_today && !t.done && !t.done_today && !later(t))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const upcoming = active.filter(later).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const doneList = active.filter((t) => t.done_today || (t.done && !["once", "daily", "days"].includes(t.repeat)));
  const otherDays = active
    .filter((t) => !t.scheduled_today && !t.done_today)
    .sort((a, b) => daysUntilNext(a.weekdays ?? [], a.today) - daysUntilNext(b.weekdays ?? [], b.today));
  const earnedToday = Number(progress?.earned_today ?? 0);
  const unlocks = nextUnlocks(types ?? [], progress ?? null);
  const habits: Record<string, HabitSummary> = {};
  for (const t of active) if (isHabit(t)) habits[t.id] = summarizeHabit(t, daysByTask.get(t.id) ?? [], today);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {profile?.display_name ? `Hi, ${profile.display_name}` : "Today"}
          </h1>
          <p className="truncate text-sm text-muted">
            {calendarOn
              ? view === "day"
                ? "Check tasks off on today's list."
                : "Tap a day to see it on its own."
              : todo.length === 0 && active.length > 0
              ? "Everything's done. Go build something!"
              : `${todo.length} to do · ${doneList.length} done`}
          </p>
        </div>

        <CalendarBar view={view} date={date} today={today} />

        {!calendarOn ? (
          <TaskList todo={todo} done={doneList} otherDays={otherDays} upcoming={upcoming} habits={habits} />
        ) : view === "day" ? (
          <DayView tasks={active} date={date} today={today} done={done} />
        ) : view === "week" ? (
          <WeekView tasks={active} date={date} today={today} done={done} />
        ) : (
          <MonthView tasks={active} date={date} today={today} done={done} />
        )}

        <section className="card" aria-labelledby="add-task">
          <h2 id="add-task" className="mb-3 font-semibold">Add a task</h2>
          <AddTaskForm />
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card" aria-labelledby="coins-today">
          <h2 id="coins-today" className="text-sm font-semibold text-muted">Coins earned today</h2>
          <p className="mt-1 text-3xl font-bold text-coin">
            <CoinIcon /> {formatCoins(earnedToday)}
          </p>
          <p className="mt-2 text-xs text-muted">Easy 10 · Medium 25 · Hard 50 · Epic 100. No daily limit.</p>
          <Link href="/city" className="btn-secondary mt-3 w-full">Build in your city</Link>
        </section>

        <section className="card" aria-labelledby="unlocks">
          <h2 id="unlocks" className="font-semibold">Area points</h2>
          <p className="mb-3 text-xs text-muted">Every check-off earns points in its life area. Points unlock buildings and are never spent.</p>
          <AreaPoints unlocks={unlocks} />
        </section>
      </aside>
    </div>
  );
}

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <TasksPageContent searchParams={searchParams} />
    </Suspense>
  );
}
