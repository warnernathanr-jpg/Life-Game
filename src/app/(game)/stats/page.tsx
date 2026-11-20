import type { Metadata } from "next";
import { Award, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";
import { addDays, isHabit, rateWords, summarizeHabit } from "@/lib/habits";
import { describeSchedule } from "@/lib/tasks";
import { ActivityChart } from "./activity-chart";
import { HistoryCalendar, type DoneItem } from "./history-calendar";

export const metadata: Metadata = { title: "Stats · LifeCity" };

async function StatsContent({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  const { month: monthParam } = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: tasks }, { data: goals }, { data: profile }] = await Promise.all([
    supabase.rpc("my_tasks"),
    supabase.from("goals").select("id, completed_at, target_date"),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const today = tasks?.[0]?.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const weekAgo = addDays(today, -6);

  // The calendar's month (?month=YYYY-MM, never in the future), defaulting to this month.
  const month = typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= today.slice(0, 7) ? monthParam : today.slice(0, 7);
  const [mY, mM] = month.split("-").map(Number);
  const nextMonth = mM === 12 ? `${mY + 1}-01` : `${mY}-${String(mM + 1).padStart(2, "0")}`;
  await supabase.rpc("sync_achievements"); // save any badge earned since the last visit
  const { data: badges } = await supabase.from("achievements").select("id, seen");
  const badgeCount = (badges ?? []).filter((b) => ACHIEVEMENTS.some((a) => a.id === b.id)).length;
  const newBadges = (badges ?? []).filter((b) => !b.seen).length;
  const [{ data: completions }, { count: allCheckoffs }, { data: focus }, { data: monthDone }] = await Promise.all([
    supabase.from("task_completions").select("task_id, local_day").or(NOT_GRANT).gte("local_day", addDays(today, -35)),
    supabase.from("task_completions").select("id", { count: "exact", head: true }).or(NOT_GRANT),
    supabase.from("focus_sessions").select("minutes, local_day").eq("status", "completed"),
    supabase
      .from("task_completions")
      .select("local_day, title, area, completed_at")
      .or(NOT_GRANT)
      .gte("local_day", `${month}-01`)
      .lt("local_day", `${nextMonth}-01`)
      .order("completed_at"),
  ]);

  const recent = completions ?? [];
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    return { day, count: recent.filter((c) => c.local_day === day).length };
  });
  const checkoffsWeek = recent.filter((c) => c.local_day >= weekAgo).length;
  const focusAll = (focus ?? []).reduce((s, f) => s + f.minutes, 0);
  const focusWeek = (focus ?? []).filter((f) => f.local_day >= weekAgo).reduce((s, f) => s + f.minutes, 0);
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const doneItems: DoneItem[] = (monthDone ?? []).map((c) => ({
    day: c.local_day,
    title: c.title ?? "Task",
    area: c.area,
    time: timeFmt.format(new Date(c.completed_at)),
  }));
  const activeGoals = (goals ?? []).filter((g) => !g.completed_at);
  const reachedGoals = (goals ?? []).length - activeGoals.length;
  const lateGoals = activeGoals.filter((g) => g.target_date < today).length;

  const daysByTask = new Map<string, string[]>();
  for (const c of recent) if (c.task_id) daysByTask.set(c.task_id, [...(daysByTask.get(c.task_id) ?? []), c.local_day]);
  const habits = (tasks ?? [])
    .filter((t) => !t.archived_at && isHabit(t))
    .map((t) => ({ task: t, summary: summarizeHabit(t, daysByTask.get(t.id) ?? [], today) }))
    .sort((a, b) => b.summary.rate - a.summary.rate);

  const tiles = [
    { label: "Done today", value: String(recent.filter((c) => c.local_day === today).length), note: "check-offs today" },
    { label: "Check-offs", value: String(checkoffsWeek), note: `last 7 days · ${formatCoins(allCheckoffs ?? 0)} all time` },
    { label: "Focus", value: `${focusWeek} min`, note: `last 7 days · ${formatCoins(focusAll)} min all time` },
    { label: "Goals", value: String(activeGoals.length), note: `in progress · ${reachedGoals} reached${lateGoals ? ` · ${lateGoals} past the date` : ""}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="text-sm text-muted">How you&apos;re doing with your tasks, habits, focus and goals. (Your city&apos;s numbers are on the City page.)</p>
      </div>

      <Link href="/achievements" className="card flex items-center gap-3 hover:border-accent/60">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-coin text-on-coin">
          <Award className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            Achievements
            {newBadges > 0 && <span className="ml-2 rounded-full bg-coin px-2 py-0.5 text-xs font-bold text-on-coin">{newBadges} new</span>}
          </span>
          <span className="block text-sm text-muted">{badgeCount} of {ACHIEVEMENTS.length} badges earned · see your timeline</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-3 sm:p-4">
            <dt className="text-xs font-medium text-muted">{t.label}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums">{t.value}</dd>
            <dd className="text-xs text-muted">{t.note}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-6">
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

          <section className="card" aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 font-semibold">History</h2>
            <HistoryCalendar key={month} month={month} today={today} items={doneItems} />
          </section>
        </div>

      </div>
    </div>
  );
}

// Points granted by hand for testing (no task, no coins) count toward unlocks but aren't check-offs.
const NOT_GRANT = "task_id.not.is.null,coins.gt.0";

export default function StatsPage({ searchParams }: PageProps<"/stats">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your stats…</p>}>
      <StatsContent searchParams={searchParams} />
    </Suspense>
  );
}
