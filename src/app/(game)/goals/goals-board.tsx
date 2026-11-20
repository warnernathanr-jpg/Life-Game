"use client";

import { CalendarClock, Check, ChevronDown, Plus, RotateCcw, Trash2, Trophy } from "lucide-react";
import { CoinIcon } from "@/components/icons";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm";
import { IconPicker } from "@/components/icon-picker";
import { AreaIcon, ItemIcon } from "@/components/icons";
import type { GoalRow, GoalStepRow, TaskDifficulty } from "@/lib/database.types";
import { AREA_BY_ID, AREAS, DIFFICULTIES, REWARDS } from "@/lib/game";
import { addDays } from "@/lib/habits";
import { addGoal, addGoalStep, deleteGoal, deleteGoalStep, setGoalDone, setGoalStepDone, type AddGoalState } from "../actions";

/** Mirrors the database: a step pays its tier like a task (task_reward), a goal ten times its tier (goal_reward), and
 *  only goals set at least MIN_DAYS earlier pay their bonus (goal_min_days). The database decides. */
const goalBonus = (d: TaskDifficulty) => REWARDS[d] * 10;
const MIN_DAYS = 3;

/** Whole days from `from` to `to` (YYYY-MM-DD). */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function dueText(target: string, today: string) {
  const d = daysBetween(today, target);
  if (d === 0) return { text: "Due today", late: false };
  if (d === 1) return { text: "Due tomorrow", late: false };
  if (d > 1) return { text: `${d} days left`, late: false };
  return { text: `${-d} day${d === -1 ? "" : "s"} past the date`, late: true };
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function GoalsBoard({ goals, steps, today }: { goals: GoalRow[]; steps: GoalStepRow[]; today: string }) {
  const active = goals.filter((g) => !g.completed_at);
  const done = goals.filter((g) => g.completed_at).sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const stepsOf = (id: string) => steps.filter((s) => s.goal_id === id);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-3">
        {active.length === 0 ? (
          <div className="card text-center">
            <Trophy className="mx-auto size-10 text-coin" aria-hidden />
            <p className="mt-2 font-semibold">No goals yet</p>
            <p className="text-sm text-muted">Add one: run a 5K, finish a course, save for something. Give it a date and break it into steps.</p>
          </div>
        ) : (
          active.map((g) => <GoalCard key={g.id} goal={g} steps={stepsOf(g.id)} today={today} />)
        )}
        {done.length > 0 && (
          <details className="card">
            <summary className="flex cursor-pointer items-center justify-between font-semibold">
              <span>Completed · {done.length}</span>
              <ChevronDown className="size-4 text-muted" aria-hidden />
            </summary>
            <div className="mt-3 space-y-3">
              {done.map((g) => (
                <GoalCard key={g.id} goal={g} steps={stepsOf(g.id)} today={today} />
              ))}
            </div>
          </details>
        )}
      </div>
      <aside>
        <AddGoalForm today={today} />
      </aside>
    </div>
  );
}

function GoalCard({ goal, steps, today }: { goal: GoalRow; steps: GoalStepRow[]; today: string }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState(!goal.completed_at);
  const [newStep, setNewStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const doneSteps = steps.filter((s) => s.done_at).length;
  const pct = steps.length ? Math.round((doneSteps / steps.length) * 100) : goal.completed_at ? 100 : 0;
  const due = dueText(goal.target_date, today);
  const isDone = !!goal.completed_at;
  const run = (fn: () => Promise<{ ok: boolean; error?: string; coins?: number }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Something went wrong."));
      if (r.ok && typeof r.coins === "number" && r.coins !== 0) setNote(r.coins > 0 ? `+${r.coins} coins!` : `${r.coins} coins`);
      else if (r.ok) setNote(null);
    });
  const ageDays = daysBetween(goal.created_at.slice(0, 10), today);
  const bonus = goalBonus(goal.difficulty);
  const [stepTier, setStepTier] = useState<TaskDifficulty>("easy");
  const paidSteps = steps.filter((st) => st.coins > 0).length;

  return (
    <section className={`card ${isDone ? "opacity-80" : ""}`} aria-label={goal.title}>
      {confirmDialog}
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent-text">
          <ItemIcon icon={goal.icon} area={goal.area} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`font-semibold break-words ${isDone ? "text-muted line-through" : ""}`}>{goal.title}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {goal.area && (
              <span>
                <AreaIcon area={goal.area} className="size-3.5" /> {AREA_BY_ID[goal.area].label}
              </span>
            )}
            <span className={!isDone && due.late ? "font-semibold text-bad" : ""}>
              <CalendarClock className="size-3.5" aria-hidden /> {dateFmt.format(new Date(`${goal.target_date}T00:00:00Z`))}
              {!isDone && ` · ${due.text}`}
            </span>
            {isDone && (
              <span className="text-good">
                Done {dateFmt.format(new Date(goal.completed_at!))}
                {goal.reward_coins ? ` · +${goal.reward_coins} coins` : ""}
              </span>
            )}
            {!isDone && (
              <span className="text-coin">
                <CoinIcon className="size-3.5" /> {bonus} when reached{ageDays < MIN_DAYS ? ` (from day ${MIN_DAYS})` : ""}
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide steps" : "Show steps"} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised">
          <ChevronDown className={`size-5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{steps.length ? `${doneSteps} of ${steps.length} steps` : "No steps yet"}</span>
          <span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
          <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {goal.notes && <p className="text-sm whitespace-pre-line text-ink">{goal.notes}</p>}
          {steps.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setGoalStepDone(s.id, !s.done_at))}
                    aria-pressed={!!s.done_at}
                    aria-label={s.done_at ? `Mark “${s.title}” not done` : `Mark “${s.title}” done`}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${s.done_at ? "border-good bg-good text-bg" : "border-line bg-raised hover:border-accent"}`}
                  >
                    {s.done_at && <Check className="size-4" strokeWidth={3} aria-hidden />}
                  </button>
                  <span className={`min-w-0 flex-1 text-sm break-words ${s.done_at ? "text-muted line-through" : ""}`}>{s.title}</span>
                  {(s.coins > 0 || (!s.done_at && !isDone && paidSteps < 20)) && (
                    <span className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold ${s.done_at ? "text-good" : "text-coin"}`}>
                      +{s.coins || REWARDS[s.difficulty]} <CoinIcon className="size-3.5" />
                    </span>
                  )}
                  <button type="button" disabled={pending} onClick={() => run(() => deleteGoalStep(s.id))} aria-label={`Delete step “${s.title}”`} className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!isDone && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const title = newStep;
                setNewStep("");
                run(() => addGoalStep(goal.id, title, stepTier));
              }}
            >
              <input value={newStep} onChange={(e) => setNewStep(e.target.value)} maxLength={120} placeholder="Add a step" className="input min-w-0 flex-1" aria-label="New step" />
              <select value={stepTier} onChange={(e) => setStepTier(e.target.value as TaskDifficulty)} className="input w-auto" aria-label="Step difficulty">
                {DIFFICULTIES.map((d) => (
                  <option key={d.id} value={d.id}>{d.label} +{REWARDS[d.id]}</option>
                ))}
              </select>
              <button type="submit" disabled={pending || !newStep.trim()} className="btn-secondary px-3" aria-label="Add step">
                <Plus className="size-4" aria-hidden />
              </button>
            </form>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {note && !error && <p role="status" className="text-sm font-semibold text-good">{note}</p>}
          <div className="flex flex-wrap gap-2">
            {isDone ? (
              <button type="button" disabled={pending} onClick={() => run(() => setGoalDone(goal.id, false))} className="btn-secondary">
                <RotateCcw className="size-4" aria-hidden /> Reopen
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => run(() => setGoalDone(goal.id, true))} className="btn-primary">
                <Trophy className="size-4" aria-hidden /> Mark goal reached
                {ageDays >= MIN_DAYS && (
                  <span className="flex items-center gap-0.5">
                    · +{bonus} <CoinIcon className="size-4 text-on-accent" />
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({ title: `Delete “${goal.title}”?`, message: "Its steps are deleted too.", confirmLabel: "Delete", tone: "danger" });
                if (ok) run(() => deleteGoal(goal.id));
              }}
              className="btn-secondary text-bad"
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The new goal's steps: one field per step with its own difficulty, and a button to add another. */
function StepFields() {
  const [rows, setRows] = useState([{ key: 0, focus: false }]);
  const nextKey = useRef(1);
  const add = () => setRows((r) => (r.length >= 30 ? r : [...r, { key: nextKey.current++, focus: true }]));
  return (
    <fieldset>
      <legend className="text-sm font-medium">Steps <span className="font-normal text-muted">(optional)</span></legend>
      <ol className="mt-1 space-y-2">
        {rows.map((row, i) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs text-muted" aria-hidden>{i + 1}.</span>
            <input
              name="step_title"
              maxLength={120}
              autoFocus={row.focus}
              aria-label={`Step ${i + 1}`}
              placeholder={i === 0 ? "e.g. Run 1 km without stopping" : "Next step"}
              className="input min-w-0 flex-1"
              onKeyDown={(e) => {
                // Enter adds another step instead of sending the form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.currentTarget.value.trim() && i === rows.length - 1) add();
                }
              }}
            />
            <select name="step_difficulty" defaultValue="easy" aria-label={`Step ${i + 1} difficulty`} className="input w-[6.75rem] shrink-0 px-2 text-sm sm:w-32">
              {DIFFICULTIES.map((d) => (
                <option key={d.id} value={d.id}>{d.label} +{REWARDS[d.id]}</option>
              ))}
            </select>
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {rows.length < 30 && (
        <button type="button" onClick={add} className="link mt-2 text-sm">+ Add another step</button>
      )}
    </fieldset>
  );
}

function AddGoalForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<AddGoalState, FormData>(addGoal, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [area, setArea] = useState("");
  useEffect(() => {
    if (state.added) formRef.current?.reset();
  }, [state.added]);
  return (
    <form ref={formRef} action={action} className="card space-y-3" noValidate>
      <h2 className="font-semibold">Add a goal</h2>
      <label className="block">
        <span className="text-sm font-medium">Goal</span>
        <input name="title" required maxLength={120} placeholder="e.g. Run a 5K" className="input mt-1" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-sm font-medium">Icon</span>
          <IconPicker key={state.added ?? 0} area={area || null} />
        </div>
        <label className="block">
          <span className="text-sm font-medium">Life area</span>
          <select name="area" value={area} onChange={(e) => setArea(e.target.value)} className="input mt-1">
            <option value="">None</option>
            {AREAS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Difficulty</legend>
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {DIFFICULTIES.map((d) => (
            <label key={d.id} className="flex cursor-pointer flex-col items-center rounded-xl border border-line px-1 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="difficulty" value={d.id} defaultChecked={d.id === "medium"} className="sr-only" />
              <span className="font-semibold">{d.label}</span>
              <span className="flex items-center gap-0.5 text-xs text-coin">
                +{goalBonus(d.id)} <CoinIcon className="size-3" />
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Paid when you reach the goal, if you set it at least {MIN_DAYS} days before. Steps pay like tasks (easy +{REWARDS.easy} … epic +{REWARDS.epic}).
        </p>
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">Reach it by</span>
        <input type="date" name="target_date" required min={today} defaultValue={addDays(today, 30)} className="input mt-1" />
      </label>
      <StepFields key={state.added ?? 0} />
      <label className="block">
        <span className="text-sm font-medium">Notes <span className="font-normal text-muted">(optional)</span></span>
        <textarea name="notes" rows={2} maxLength={1000} className="input mt-1" />
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Adding…" : "Add goal"}
      </button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}
