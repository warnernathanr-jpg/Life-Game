"use client";

import { useState, useTransition } from "react";
import type { MyTaskRow } from "@/lib/database.types";
import { AREA_BY_ID } from "@/lib/game";
import { describeNext, describeProgress, describeSchedule } from "@/lib/tasks";
import { completeTask, removeTask, restoreTask, undoTask } from "../actions";

export function TaskList({
  todo,
  done,
  otherDays,
  archived,
}: {
  todo: MyTaskRow[];
  done: MyTaskRow[];
  otherDays: MyTaskRow[];
  archived: MyTaskRow[];
}) {
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [pop, setPop] = useState<{ id: string; coins: number; key: number } | null>(null);

  if (todo.length + done.length + otherDays.length + archived.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-4xl" aria-hidden>🌱</p>
        <p className="mt-2 font-medium">No tasks yet</p>
        <p className="text-sm text-slate-600">Add a few below: a daily habit, a weekly routine and something you&apos;ve been putting off.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" className={`min-h-5 text-sm ${message?.tone === "bad" ? "text-red-700" : "text-emerald-700"}`}>
        {message?.text}
      </p>
      <section className="card p-0 sm:p-0" aria-labelledby="todo-h">
        <h2 id="todo-h" className="px-4 pt-4 font-semibold sm:px-5">To do</h2>
        {todo.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-slate-500 sm:px-5">Nothing left. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todo.map((t) => (
              <TaskRow key={t.id} task={t} pop={pop} setPop={setPop} setMessage={setMessage} />
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="card p-0 sm:p-0" aria-labelledby="done-h">
          <h2 id="done-h" className="px-4 pt-4 font-semibold sm:px-5">Done</h2>
          <ul className="divide-y divide-slate-100">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} pop={pop} setPop={setPop} setMessage={setMessage} />
            ))}
          </ul>
        </section>
      )}
      {otherDays.length > 0 && (
        <section className="card p-0 sm:p-0" aria-labelledby="other-h">
          <h2 id="other-h" className="px-4 pt-4 font-semibold sm:px-5">Other days</h2>
          <ul className="divide-y divide-slate-100">
            {otherDays.map((t) => (
              <OtherDayRow key={t.id} task={t} setMessage={setMessage} />
            ))}
          </ul>
        </section>
      )}
      {archived.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Archived ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {archived.map((t) => (
              <ArchivedRow key={t.id} task={t} setMessage={setMessage} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type SetMessage = (m: { text: string; tone: "good" | "bad" } | null) => void;

function TaskRow({
  task,
  pop,
  setPop,
  setMessage,
}: {
  task: MyTaskRow;
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
          setMessage({
            text: r.coins > 0 ? `+${r.coins} coins for “${task.title}”!` : `“${task.title}” done. Daily coin limit reached, but it still counts toward unlocks.`,
            tone: "good",
          });
        } else {
          setMessage({ text: r.error, tone: "bad" });
        }
      }
    });
  }

  function remove() {
    const verb = task.total_completions > 0 ? "Archive" : "Delete";
    if (!window.confirm(`${verb} “${task.title}”?`)) return;
    start(async () => {
      const r = await removeTask(task.id);
      setMessage(r.ok ? { text: r.archived ? "Archived. Its past completions still count." : "Deleted.", tone: "good" } : { text: r.error, tone: "bad" });
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
          checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white hover:border-emerald-600"
        }`}
      >
        {checked ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`break-words font-medium ${task.done ? "text-slate-500 line-through" : ""}`}>{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span><span aria-hidden>{area.icon}</span> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          {progress && <span className={task.done ? "" : "font-medium text-emerald-700"}>· {progress}</span>}
          {task.total_completions > 0 && <span>· {task.total_completions}× total</span>}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${checked ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-900"}`}>
        +{task.reward}
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Remove “${task.title}”`}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
      {pop?.id === task.id && pop.coins > 0 && (
        <span key={pop.key} aria-hidden className="coin-pop pointer-events-none absolute top-1 right-16 font-bold text-amber-600">
          +{pop.coins} 🪙
        </span>
      )}
    </li>
  );
}

function OtherDayRow({ task, setMessage }: { task: MyTaskRow; setMessage: SetMessage }) {
  const [pending, start] = useTransition();
  const area = AREA_BY_ID[task.area];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${pending ? "opacity-60" : ""}`}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base">📅</span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-slate-700">{task.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span><span aria-hidden>{area.icon}</span> {area.label}</span>
          <span>· {describeSchedule(task)}</span>
          <span>· Next: {describeNext(task.weekdays ?? [], task.today)}</span>
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove “${task.title}”`}
        onClick={() => {
          const verb = task.total_completions > 0 ? "Archive" : "Delete";
          if (!window.confirm(`${verb} “${task.title}”?`)) return;
          start(async () => {
            const r = await removeTask(task.id);
            setMessage(r.ok ? { text: r.archived ? "Archived. Its past completions still count." : "Deleted.", tone: "good" } : { text: r.error, tone: "bad" });
          });
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </li>
  );
}

function ArchivedRow({ task, setMessage }: { task: MyTaskRow; setMessage: SetMessage }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="truncate text-slate-600">{task.title}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await restoreTask(task.id);
            setMessage(r.ok ? { text: "Restored.", tone: "good" } : { text: r.error, tone: "bad" });
          })
        }
        className="link shrink-0"
      >
        Restore
      </button>
    </li>
  );
}
