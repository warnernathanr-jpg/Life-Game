"use client";

import { useState, useTransition } from "react";
import type { MyTaskRow } from "@/lib/database.types";
import { AREA_BY_ID, nextMilestone } from "@/lib/game";
import { rateWords, type HabitSummary } from "@/lib/habits";
import { describeNext, describeProgress, describeSchedule } from "@/lib/tasks";
import { completeTask, removeTask, undoTask } from "../actions";

export function TaskList({
  todo,
  done,
  otherDays,
  habits,
}: {
  todo: MyTaskRow[];
  done: MyTaskRow[];
  otherDays: MyTaskRow[];
  habits: Record<string, HabitSummary>;
}) {
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [pop, setPop] = useState<{ id: string; coins: number; key: number } | null>(null);

  if (todo.length + done.length + otherDays.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-4xl" aria-hidden>🌱</p>
        <p className="mt-2 font-medium">No tasks yet</p>
        <p className="text-sm text-muted">Add a few below: a daily habit, a weekly routine and something you&apos;ve been putting off.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" className={`min-h-5 text-sm ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
        {message?.text}
      </p>
      <section className="card p-0 sm:p-0" aria-labelledby="todo-h">
        <h2 id="todo-h" className="px-4 pt-4 font-semibold sm:px-5">To do</h2>
        {todo.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted sm:px-5">Nothing left. 🎉</p>
        ) : (
          <ul className="divide-y divide-line">
            {todo.map((t) => (
              <TaskRow key={t.id} task={t} habit={habits[t.id]} pop={pop} setPop={setPop} setMessage={setMessage} />
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="card p-0 sm:p-0" aria-labelledby="done-h">
          <h2 id="done-h" className="px-4 pt-4 font-semibold sm:px-5">Done</h2>
          <ul className="divide-y divide-line">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} habit={habits[t.id]} pop={pop} setPop={setPop} setMessage={setMessage} />
            ))}
          </ul>
        </section>
      )}
      {otherDays.length > 0 && (
        <section className="card p-0 sm:p-0" aria-labelledby="other-h">
          <h2 id="other-h" className="px-4 pt-4 font-semibold sm:px-5">Other days</h2>
          <ul className="divide-y divide-line">
            {otherDays.map((t) => (
              <OtherDayRow key={t.id} task={t} setMessage={setMessage} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type SetMessage = (m: { text: string; tone: "good" | "bad" } | null) => void;

function TaskRow({
  task,
  habit,
  pop,
  setPop,
  setMessage,
}: {
  task: MyTaskRow;
  habit?: HabitSummary;
  pop: { id: string; coins: number; key: number } | null;
  setPop: (p: { id: string; coins: number; key: number } | null) => void;
  setMessage: SetMessage;
}) {
  const [pending, start] = useTransition();
  const area = AREA_BY_ID[task.area];
  // Checked when done today, or done earlier in its week/month/quarter/year.
  const checked = task.done_today || task.done;
  const progress = describeProgress(task);

  function toggle() {
    start(async () => {
      if (checked) {
        const r = await undoTask(task.id);
        setMessage(r.ok ? { text: `Undone. ${r.coins ? `−${r.coins} coins.` : ""}`, tone: "good" } : { text: r.error, tone: "bad" });
      } else {
        const r = await completeTask(task.id);
        if (r.ok) {
          setPop({ id: task.id, coins: r.coins, key: Date.now() });
          const bonus = r.coins - Math.min(r.coins, task.reward);
          setMessage({
            text:
              bonus > 0
                ? `+${r.coins} coins! Milestone bonus for ${task.total_completions + 1} check-offs of “${task.title}”.`
                : `+${r.coins} coins for “${task.title}”!`,
            tone: "good",
          });
        } else {
          setMessage({ text: r.error, tone: "bad" });
        }
      }
    });
  }

  function remove() {
    const keep = task.total_completions > 0 ? " Its past check-offs still count toward your points and history." : "";
    if (!window.confirm(`Delete “${task.title}”?${keep}`)) return;
    start(async () => {
      const r = await removeTask(task.id);
      setMessage(r.ok ? { text: "Deleted.", tone: "good" } : { text: r.error, tone: "bad" });
    });
  }

  return (
    <li className={`relative flex items-center gap-3 px-4 py-3 sm:px-5 ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={checked}
        aria-label={checked ? `Undo “${task.title}”` : `Complete “${task.title}” for ${task.reward} coins`}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-lg transition ${
          checked ? "border-good bg-good text-bg" : "border-line bg-raised hover:border-accent"
        }`}
      >
        {checked ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`break-words font-medium ${task.done ? "text-muted line-through" : ""}`}>{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span><span aria-hidden>{area.icon}</span> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          {progress && <span className={task.done ? "" : "font-medium text-good"}>· {progress}</span>}
          {task.total_completions > 0 && <span>· {task.total_completions}× total</span>}
        </p>
        {habit && <HabitRhythm habit={habit} total={task.total_completions} />}
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${checked ? "bg-raised text-faint" : "bg-coin-soft text-coin"}`}>
        +{task.reward}
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete “${task.title}”`}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink"
      >
        ×
      </button>
      {pop?.id === task.id && pop.coins > 0 && (
        <span key={pop.key} aria-hidden className="coin-pop pointer-events-none absolute top-1 right-16 font-bold text-coin">
          +{pop.coins} 🪙
        </span>
      )}
    </li>
  );
}

/** Last 7 days as dots, a gentle consistency line, and the next milestone. Nothing here ever resets. */
function HabitRhythm({ habit, total }: { habit: HabitSummary; total: number }) {
  const next = nextMilestone(total);
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1" role="img" aria-label={`Last 7 days: ${habit.line}`}>
        {habit.week.map((d) => (
          <span
            key={d.day}
            title={`${dayName(d.day)}: ${d.done ? "done" : d.scheduled ? "not done" : "rest day"}`}
            className={`size-2.5 rounded-full ${d.done ? "bg-good" : d.scheduled ? "border border-line bg-raised" : "bg-transparent"}`}
          />
        ))}
      </span>
      <span>{habit.line}</span>
      {habit.rate > 0 && <span className="font-medium text-good">{rateWords(habit.rate)}</span>}
      {next && (
        <span>
          🎯 {next.at - total} to go for +{next.bonus} bonus
        </span>
      )}
    </div>
  );
}

function OtherDayRow({ task, setMessage }: { task: MyTaskRow; setMessage: SetMessage }) {
  const [pending, start] = useTransition();
  const area = AREA_BY_ID[task.area];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${pending ? "opacity-60" : ""}`}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-base">📅</span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-ink">{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span><span aria-hidden>{area.icon}</span> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          <span>· Next: {describeNext(task.weekdays ?? [], task.today)}</span>
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete “${task.title}”`}
        onClick={() => {
          const keep = task.total_completions > 0 ? " Its past check-offs still count toward your points and history." : "";
          if (!window.confirm(`Delete “${task.title}”?${keep}`)) return;
          start(async () => {
            const r = await removeTask(task.id);
            setMessage(r.ok ? { text: "Deleted.", tone: "good" } : { text: r.error, tone: "bad" });
          });
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink"
      >
        ×
      </button>
    </li>
  );
}
