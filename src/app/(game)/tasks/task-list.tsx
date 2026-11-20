"use client";

import { CoinIcon } from "@/components/icons";

import { CalendarDays, Check, Sprout, Target } from "lucide-react";

import { AreaIcon, ItemIcon } from "@/components/icons";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm";
import type { MyTaskRow, TimeOfDay } from "@/lib/database.types";
import { AREA_BY_ID, nextMilestone } from "@/lib/game";
import { rateWords, type HabitSummary } from "@/lib/habits";
import { TIMES_OF_DAY, describeNext, describeProgress, describeSchedule } from "@/lib/tasks";
import { describeDue } from "@/lib/task-calendar";
import { completeTask, removeTask, undoTask } from "../actions";

export function TaskList({
  todo,
  done,
  otherDays,
  upcoming,
  habits,
}: {
  todo: MyTaskRow[];
  done: MyTaskRow[];
  otherDays: MyTaskRow[];
  /** One-offs due on a later day (can be done early). */
  upcoming: MyTaskRow[];
  habits: Record<string, HabitSummary>;
}) {
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [pop, setPop] = useState<{ id: string; coins: number; key: number } | null>(null);

  if (todo.length + done.length + otherDays.length + upcoming.length === 0) {
    return (
      <div className="card text-center">
        <Sprout className="mx-auto size-10 text-good" aria-hidden />
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
          <p className="px-4 pt-1 pb-4 text-sm text-muted sm:px-5">Nothing left. Nice work!</p>
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
      {upcoming.length > 0 && (
        <section className="card p-0 sm:p-0" aria-labelledby="up-h">
          <h2 id="up-h" className="px-4 pt-4 font-semibold sm:px-5">Coming up</h2>
          <ul className="divide-y divide-line">
            {upcoming.map((t) => (
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
  const [confirm, confirmDialog] = useConfirm();
  const area = AREA_BY_ID[task.area];
  // Checked when done today, or done earlier in its week/month/quarter/year.
  const checked = task.done_today || task.done;
  const progress = describeProgress(task);

  const slots = task.times_of_day ?? [];
  const hasSlots = slots.length > 0;

  function toggleSlot(slot: TimeOfDay) {
    const done = task.slots_done.includes(slot);
    const label = TIMES_OF_DAY.find((t) => t.id === slot)!.label.toLowerCase();
    start(async () => {
      if (done) {
        const r = await undoTask(task.id, slot);
        setMessage(r.ok ? { text: `Undone (${label}). ${r.coins ? `−${r.coins} coins.` : ""}`, tone: "good" } : { text: r.error, tone: "bad" });
      } else {
        const r = await completeTask(task.id, slot);
        if (r.ok) {
          setPop({ id: task.id, coins: r.coins, key: Date.now() });
          setMessage({ text: `+${r.coins} coins for “${task.title}” (${label})!`, tone: "good" });
        } else setMessage({ text: r.error, tone: "bad" });
      }
    });
  }

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

  async function remove() {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      message: task.total_completions > 0 ? "Its past check-offs still count toward your points and history." : undefined,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const r = await removeTask(task.id);
      setMessage(r.ok ? { text: "Deleted.", tone: "good" } : { text: r.error, tone: "bad" });
    });
  }

  return (
    <li className={`relative flex items-center gap-3 px-4 py-3 sm:px-5 ${pending ? "opacity-60" : ""}`}>
      {confirmDialog}
      {hasSlots ? (
        <span
          aria-hidden
          className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums ${
            task.done ? "border-good bg-good text-bg" : "border-line bg-raised text-muted"
          }`}
        >
          {task.done ? <Check className="size-5" strokeWidth={3} /> : `${task.slots_done.length}/${slots.length}`}
        </span>
      ) : (
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
          {checked ? <Check className="size-5" strokeWidth={3} aria-hidden /> : null}
        </button>
      )}
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-raised text-accent-text">
        <ItemIcon icon={task.icon} area={task.area} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`break-words font-medium ${task.done ? "text-muted line-through" : ""}`}>{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span><AreaIcon area={area.id} className="size-3.5" /> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          {task.repeat === "once" && task.due_date && !task.done && (
            <span className={task.due_date < task.today ? "font-medium text-coin" : task.due_date === task.today ? "font-medium text-accent-text" : ""}>
              · {describeDue(task.due_date, task.today)}
            </span>
          )}
          {progress && <span className={task.done ? "" : "font-medium text-good"}>· {progress}</span>}
          {task.total_completions > 0 && <span>· {task.total_completions}× total</span>}
        </p>
        {hasSlots && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={`Times of day for “${task.title}”`}>
            {TIMES_OF_DAY.filter((t) => slots.includes(t.id)).map((t) => {
              const done = task.slots_done.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleSlot(t.id)}
                  disabled={pending || (!task.scheduled_today && !done)}
                  aria-pressed={done}
                  aria-label={done ? `Undo ${t.label.toLowerCase()}` : `Done ${t.label.toLowerCase()} (+${task.reward} coins)`}
                  className={`flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${
                    done ? "border-good bg-good text-bg" : "border-line bg-raised text-ink hover:border-accent"
                  }`}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <t.Icon className="size-3.5" aria-hidden />}
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
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
          +{pop.coins} <CoinIcon className="size-3.5 text-coin" />
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
          <Target className="size-3.5" aria-hidden /> {next.at - total} to go for +{next.bonus} bonus
        </span>
      )}
    </div>
  );
}

function OtherDayRow({ task, setMessage }: { task: MyTaskRow; setMessage: SetMessage }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const area = AREA_BY_ID[task.area];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${pending ? "opacity-60" : ""}`}>
      {confirmDialog}
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted"><CalendarDays className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-ink">{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span><AreaIcon area={area.id} className="size-3.5" /> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          <span>· Next: {describeNext(task.weekdays ?? [], task.today)}</span>
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete “${task.title}”`}
        onClick={async () => {
          const ok = await confirm({
            title: `Delete “${task.title}”?`,
            message: task.total_completions > 0 ? "Its past check-offs still count toward your points and history." : undefined,
            confirmLabel: "Delete",
            tone: "danger",
          });
          if (!ok) return;
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
