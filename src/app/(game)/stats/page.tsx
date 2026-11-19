import type { Metadata } from "next";
import { Suspense } from "react";
import { AreaPoints } from "@/components/area-points";
import { requireUser } from "@/lib/auth";
import { cityStats, formatCoins, nextUnlocks } from "@/lib/game";
import { addDays, isHabit, rateWords, summarizeHabit } from "@/lib/habits";
import { describeSchedule } from "@/lib/tasks";
import { ActivityChart } from "./activity-chart";

export const metadata: Metadata = { title: "Stats · Life City" };

const KIND_ICON = { task: "✅", task_undo: "↩️", building: "🏗️", building_sold: "🧱", land: "🗺️", bonus: "🎁", focus: "⏱️" } as const;

async function StatsContent() {
  const { supabase } = await requireUser();
  const [{ data: tasks }, { data: progress }, { data: types }, { data: placed }, { data: profile }] = await Promise.all([
    supabase.rpc("my_tasks"),
    supabase.rpc("my_progress").maybeSingle(),
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.from("placed_buildings").select("id, type_id, x, y"),
    supabase.from("profiles").select("timezone, city_name").maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const today = tasks?.[0]?.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const weekAgo = addDays(today, -6);

  const [{ data: completions }, { count: allCheckoffs }, { data: focus }, { data: ledger }] = await Promise.all([
    supabase.from("task_completions").select("task_id, local_day").gte("local_day", addDays(today, -35)),
    supabase.from("task_completions").select("id", { count: "exact", head: true }),
    supabase.from("focus_sessions").select("minutes, local_day").eq("status", "completed"),
    supabase.from("coin_ledger").select("id, amount, kind, reason, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50),
  ]);

  const recent = completions ?? [];
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    return { day, count: recent.filter((c) => c.local_day === day).length };
  });
  const checkoffsWeek = recent.filter((c) => c.local_day >= weekAgo).length;
  const focusAll = (focus ?? []).reduce((s, f) => s + f.minutes, 0);
  const focusWeek = (focus ?? []).filter((f) => f.local_day >= weekAgo).reduce((s, f) => s + f.minutes, 0);
  const entries = ledger ?? [];
  const city = cityStats(placed ?? [], types ?? []);

  const daysByTask = new Map<string, string[]>();
  for (const c of recent) daysByTask.set(c.task_id, [...(daysByTask.get(c.task_id) ?? []), c.local_day]);
  const habits = (tasks ?? [])
    .filter((t) => !t.archived_at && isHabit(t))
    .map((t) => ({ task: t, summary: summarizeHabit(t, daysByTask.get(t.id) ?? [], today) }))
    .sort((a, b) => b.summary.rate - a.summary.rate);

  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  const tiles = [
    { label: "Coins", value: `🪙 ${formatCoins(Number(progress?.balance ?? 0))}`, note: "to spend" },
    { label: "Check-offs", value: String(checkoffsWeek), note: `last 7 days · ${formatCoins(allCheckoffs ?? 0)} all time` },
    { label: "Focus", value: `${focusWeek} min`, note: `last 7 days · ${formatCoins(focusAll)} min all time` },
    { label: "Population", value: formatCoins(city.population), note: `${city.buildings} buildings · ${city.happiness}% happy` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="text-sm text-muted">How you&apos;re doing, and what it&apos;s building.</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-3 sm:p-4">
            <dt className="text-xs font-medium text-muted">{t.label}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums">{t.value}</dd>
            <dd className="text-xs text-muted">{t.note}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="card" aria-labelledby="act-h">
            <h2 id="act-h" className="font-semibold">Check-offs per day</h2>
            <p className="mb-2 text-xs text-muted">Last 14 days</p>
            <ActivityChart days={days} />
          </section>

          <section className="card" aria-labelledby="hab-h">
            <h2 id="hab-h" className="font-semibold">Habits</h2>
            <p className="mb-3 text-xs text-muted">How consistent you&apos;ve been lately. Missed days never reset anything.</p>
            {habits.length === 0 ? (
              <p className="text-sm text-muted">No habits yet. Add a daily or weekly task on the Tasks page.</p>
            ) : (
              <ul className="divide-y divide-line">
                {habits.map(({ task, summary }) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-muted">
                        {describeSchedule(task)} · {summary.line} · {task.total_completions}× total
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-raised" aria-hidden>
                        <div className="h-full rounded-full bg-good" style={{ width: `${Math.round(summary.rate * 100)}%` }} />
                      </div>
                      <span className="w-28 text-right text-xs font-medium text-good">
                        {summary.rate > 0 ? `${rateWords(summary.rate)} · ${Math.round(summary.rate * 100)}%` : "Getting started"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-0 sm:p-0" aria-labelledby="hist-h">
            <h2 id="hist-h" className="px-4 pt-4 font-semibold sm:px-5">Coin history</h2>
            {entries.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted sm:px-5">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {entries.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span aria-hidden className="text-lg">{KIND_ICON[r.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.reason}</span>
                      <span className="block text-xs text-muted">{fmt.format(new Date(r.created_at))}</span>
                    </span>
                    <span className={`shrink-0 font-bold tabular-nums ${r.amount > 0 ? "text-good" : "text-ink"}`}>
                      {r.amount > 0 ? "+" : "−"}
                      {formatCoins(Math.abs(Number(r.amount)))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {entries.length === 50 && <p className="px-4 pb-3 text-xs text-muted sm:px-5">Showing the latest 50.</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card" aria-labelledby="pts-h">
            <h2 id="pts-h" className="font-semibold">Area points</h2>
            <p className="mb-3 text-xs text-muted">Earned with every check-off. They unlock buildings and are never spent.</p>
            <AreaPoints unlocks={nextUnlocks(types ?? [], progress ?? null)} />
          </section>
          <section className="card" aria-labelledby="city-h">
            <h2 id="city-h" className="font-semibold">{profile?.city_name ?? "Your city"}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {[
                ["Population", city.population],
                ["Jobs", city.jobs],
                ["Happiness", `${city.happiness}%`],
                ["City score", city.score],
                ["Buildings", city.buildings],
                ["Road tiles", city.roads],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-raised px-2.5 py-1.5">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your stats…</p>}>
      <StatsContent />
    </Suspense>
  );
}
