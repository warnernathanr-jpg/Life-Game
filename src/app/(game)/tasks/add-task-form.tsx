"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { TaskRepeat } from "@/lib/database.types";
import { AREAS, DIFFICULTIES, REWARDS } from "@/lib/game";
import { MAX_TIMES, REPEATS, WEEKDAYS } from "@/lib/tasks";
import { addTask, type AddTaskState } from "../actions";

export function AddTaskForm() {
  const [state, action, pending] = useActionState<AddTaskState, FormData>(addTask, {});
  const titleRef = useRef<HTMLInputElement>(null);
  const [repeat, setRepeat] = useState<TaskRepeat>("daily");
  const [days, setDays] = useState<number[]>([]);

  // After each successful add, clear the title (keep the other choices) and focus it for the next one.
  useEffect(() => {
    if (state.added && titleRef.current) {
      titleRef.current.value = "";
      titleRef.current.focus();
    }
  }, [state.added]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" noValidate>
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium text-ink">Task</span>
        <input ref={titleRef} name="title" required maxLength={120} placeholder="e.g. Go for a 20-minute walk" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Life area</span>
        <select name="area" defaultValue="health" className="input mt-1">
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Difficulty</span>
        <select name="difficulty" defaultValue="medium" className="input mt-1">
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>{d.label} (+{REWARDS[d.id]} coins)</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Repeats</span>
        <select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as TaskRepeat)} className="input mt-1">
          {REPEATS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </label>
      {repeat === "days" && (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-ink">Which days?</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.iso);
              return (
                <label
                  key={d.iso}
                  className={`flex min-h-10 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-accent ${
                    on ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-ink hover:border-accent/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.iso}
                    checked={on}
                    onChange={(e) => setDays((prev) => (e.target.checked ? [...prev, d.iso] : prev.filter((x) => x !== d.iso)))}
                    className="sr-only"
                  />
                  {d.short}
                </label>
              );
            })}
            <button type="button" className="link ml-1 text-sm" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
            <button type="button" className="link ml-1 text-sm" onClick={() => setDays([6, 7])}>Weekends</button>
          </div>
        </fieldset>
      )}
      {(repeat === "times_per_week" || repeat === "times_per_month") && (
        <label className="block">
          <span className="text-sm font-medium text-ink">How many times a {repeat === "times_per_week" ? "week" : "month"}?</span>
          <input
            key={repeat}
            name="times"
            type="number"
            inputMode="numeric"
            min={2}
            max={MAX_TIMES[repeat]}
            defaultValue={3}
            className="input mt-1"
          />
          <span className="mt-1 block text-xs text-muted">At most once a day. Each time earns coins.</span>
        </label>
      )}
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Adding…" : "Add task"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-bad sm:col-span-2">{state.error}</p>}
      {state.added && !state.error ? <p role="status" className="text-sm text-good sm:col-span-2">Task added.</p> : null}
    </form>
  );
}
