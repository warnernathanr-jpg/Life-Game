import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DAILY_COIN_CAP, formatCoins, nextUnlocks } from "@/lib/game";
import { AddTaskForm } from "./add-task-form";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "Today · Life City" };

async function TodayPageContent() {
  const { supabase } = await requireUser();
  const [{ data: tasks }, { data: progress }, { data: types }, { data: profile }] = await Promise.all([
    supabase.rpc("my_tasks"),
    supabase.rpc("my_progress").maybeSingle(),
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.from("profiles").select("display_name").maybeSingle(),
  ]);

  const all = tasks ?? [];
  const active = all.filter((t) => !t.archived_at);
  const todo = active.filter((t) => !t.done);
  const done = active.filter((t) => t.done && (t.repeat !== "once" || t.done_today));
  const archived = all.filter((t) => t.archived_at);
  const earnedToday = Number(progress?.earned_today ?? 0);
  const unlocks = nextUnlocks(types ?? [], progress ?? null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {profile?.display_name ? `Hi, ${profile.display_name}` : "Today"}
          </h1>
          <p className="text-sm text-slate-600">
            {todo.length === 0 && active.length > 0
              ? "Everything's done. Go build something!"
              : `${todo.length} to do · ${done.length} done`}
          </p>
        </div>

        <TaskList todo={todo} done={done} archived={archived} />

        <section className="card" aria-labelledby="add-task">
          <h2 id="add-task" className="mb-3 font-semibold">Add a task</h2>
          <AddTaskForm />
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card" aria-labelledby="coins-today">
          <h2 id="coins-today" className="text-sm font-semibold text-slate-600">Coins earned today</h2>
          <p className="mt-1 text-3xl font-bold text-amber-700">
            <span aria-hidden>🪙</span> {formatCoins(earnedToday)}
            <span className="text-base font-medium text-slate-500"> / {DAILY_COIN_CAP}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (earnedToday / DAILY_COIN_CAP) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {earnedToday >= DAILY_COIN_CAP
              ? "Daily limit reached. Tasks still count toward unlocks."
              : "Easy 10 · Medium 25 · Hard 50"}
          </p>
          <Link href="/city" className="btn-secondary mt-3 w-full">🏗️ Spend in your city</Link>
        </section>

        <section className="card" aria-labelledby="unlocks">
          <h2 id="unlocks" className="font-semibold">Unlocks</h2>
          <p className="mb-3 text-xs text-slate-500">Finish tasks in each life area to unlock new buildings.</p>
          <ul className="space-y-3">
            {unlocks.map(({ area, done: count, next, remaining }) => (
              <li key={area.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium"><span aria-hidden>{area.icon}</span> {area.label}</span>
                  <span className="text-slate-500">{count} done</span>
                </div>
                {next ? (
                  <>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(count / (next.unlock_count ?? 1)) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {remaining} more → <span aria-hidden>{next.icon}</span> {next.name}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-emerald-700">All {area.label.toLowerCase()} buildings unlocked</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <TodayPageContent />
    </Suspense>
  );
}
