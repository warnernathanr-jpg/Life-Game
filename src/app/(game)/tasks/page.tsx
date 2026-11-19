import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DAILY_COIN_CAP, formatCoins, nextUnlocks } from "@/lib/game";
import { AreaPoints } from "@/components/area-points";
import { addDays, isHabit, summarizeHabit, type HabitSummary } from "@/lib/habits";
import { daysUntilNext } from "@/lib/tasks";
import { AddTaskForm } from "./add-task-form";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "Tasks · Life City" };

async function TasksPageContent() {
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
  const daysByTask = new Map<string, string[]>();
  for (const c of recent ?? []) daysByTask.set(c.task_id, [...(daysByTask.get(c.task_id) ?? []), c.local_day]);

  const all = tasks ?? [];
  const active = all.filter((t) => !t.archived_at);
  // To do: on today and still needs doing. Done: checked off today, or done earlier this week/month/quarter/year.
  const todo = active.filter((t) => t.scheduled_today && !t.done && !t.done_today);
  const done = active.filter((t) => t.done_today || (t.done && !["once", "daily", "days"].includes(t.repeat)));
  const otherDays = active
    .filter((t) => !t.scheduled_today && !t.done_today)
    .sort((a, b) => daysUntilNext(a.weekdays ?? [], a.today) - daysUntilNext(b.weekdays ?? [], b.today));
  const archived = all.filter((t) => t.archived_at);
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
          <p className="text-sm text-muted">
            {todo.length === 0 && active.length > 0
              ? "Everything's done. Go build something!"
              : `${todo.length} to do · ${done.length} done`}
          </p>
        </div>

        <TaskList todo={todo} done={done} otherDays={otherDays} archived={archived} habits={habits} />

        <section className="card" aria-labelledby="add-task">
          <h2 id="add-task" className="mb-3 font-semibold">Add a task</h2>
          <AddTaskForm />
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card" aria-labelledby="coins-today">
          <h2 id="coins-today" className="text-sm font-semibold text-muted">Coins earned today</h2>
          <p className="mt-1 text-3xl font-bold text-coin">
            <span aria-hidden>🪙</span> {formatCoins(earnedToday)}
            <span className="text-base font-medium text-muted"> / {DAILY_COIN_CAP}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
            <div className="h-full rounded-full bg-coin" style={{ width: `${Math.min(100, (earnedToday / DAILY_COIN_CAP) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {earnedToday >= DAILY_COIN_CAP
              ? "Daily coin limit reached. Tasks still earn area points."
              : "Easy 10 · Medium 25 · Hard 50 · Epic 100"}
          </p>
          <Link href="/shop" className="btn-secondary mt-3 w-full">🛒 Spend in the shop</Link>
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

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <TasksPageContent />
    </Suspense>
  );
}
