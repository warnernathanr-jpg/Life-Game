"use client";

import { useActionState, useEffect, useRef } from "react";
import { AREAS, DIFFICULTIES, REPEATS, REWARDS } from "@/lib/game";
import { addTask, type AddTaskState } from "../actions";

export function AddTaskForm() {
  const [state, action, pending] = useActionState<AddTaskState, FormData>(addTask, {});
  const titleRef = useRef<HTMLInputElement>(null);

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
        <span className="text-sm font-medium text-slate-700">Task</span>
        <input ref={titleRef} name="title" required maxLength={120} placeholder="e.g. Go for a 20-minute walk" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Life area</span>
        <select name="area" defaultValue="health" className="input mt-1">
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Difficulty</span>
        <select name="difficulty" defaultValue="medium" className="input mt-1">
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>{d.label} (+{REWARDS[d.id]} coins)</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Repeats</span>
        <select name="repeat" defaultValue="daily" className="input mt-1">
          {REPEATS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Adding…" : "Add task"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      {state.added && !state.error ? <p role="status" className="text-sm text-emerald-700 sm:col-span-2">Task added.</p> : null}
    </form>
  );
}
