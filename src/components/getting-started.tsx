"use client";

// The Getting started card shown at the top of the app until the guide is finished (and its reward claimed) or skipped.
// It lists the steps, ticks the ones already done and shows how to do the next one, with a button that goes there.
import { Check, Gift, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { claimReward, hideTutorial } from "@/app/(game)/actions";
import { CoinIcon } from "@/components/icons";
import { TUTORIAL_REWARD, TUTORIAL_STEPS, currentStep, type TutorialState } from "@/lib/tutorial";

export function GettingStarted({ state }: { state: TutorialState }) {
  const [pending, start] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = currentStep(state);
  const doneCount = TUTORIAL_STEPS.filter((s) => s.done(state)).length;

  if (claimed) {
    return (
      <section className="card mb-6 border-good/50" role="status">
        <p className="flex items-center gap-2 font-semibold text-good">
          <Sparkles className="size-5" aria-hidden /> +{TUTORIAL_REWARD} coins. Your town is up and running!
        </p>
        <p className="mt-1 text-sm text-muted">Keep checking off tasks to earn more, and build whatever you like.</p>
      </section>
    );
  }

  return (
    <section className="card mb-6 border-accent/60" aria-labelledby="gs-h">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="gs-h" className="font-semibold">Getting started</h2>
          <p className="text-xs text-muted">
            {doneCount} of {TUTORIAL_STEPS.length} done · finish for <CoinIcon className="size-3" /> {TUTORIAL_REWARD} coins
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await hideTutorial()))}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised"
        >
          <X className="size-3.5" aria-hidden /> Skip
        </button>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-raised" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / TUTORIAL_STEPS.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5">
        {TUTORIAL_STEPS.map((step, i) => {
          const done = step.done(state);
          const current = next?.id === step.id;
          const hint = current ? step.hint?.(state) : null;
          return (
            <li key={step.id} className={`rounded-xl px-2 py-1.5 ${current ? "bg-accent-soft" : ""}`}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-good text-white" : current ? "bg-accent text-on-accent" : "bg-raised text-muted"
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={`text-sm ${done ? "text-muted line-through" : current ? "font-semibold" : "text-muted"}`}>
                  {step.title}
                  <span className="sr-only">{done ? " (done)" : current ? " (next)" : ""}</span>
                </span>
              </div>
              {current && (
                <div className="mt-1 pl-8">
                  <p className="text-sm text-ink/90">{hint ?? step.how}</p>
                  {step.where === "tasks" ? (
                    <Link href={step.id === "task" ? "/tasks#add-task" : "/tasks#todo-h"} className="btn-primary mt-2 min-h-10 px-3 py-1 text-sm">
                      {step.id === "task" ? "Add a task" : "Go to my tasks"}
                    </Link>
                  ) : (
                    // A full page load: the full-screen city is its own page (see hardNavigate in city-board.tsx).
                    <a href="/play" className="btn-primary mt-2 min-h-10 px-3 py-1 text-sm">Open my city</a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!next && (
        <div className="mt-3 rounded-xl bg-accent-soft p-3">
          <p className="font-semibold">Your residents moved in and have somewhere to work. Nice!</p>
          <button
            type="button"
            className="btn-primary mt-2 min-h-10 px-3 py-1 text-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await claimReward("tutorial");
                if (r.ok) setClaimed(true);
                else setError(r.error);
              })
            }
          >
            <Gift className="size-4" aria-hidden /> Claim {TUTORIAL_REWARD} coins
          </button>
          {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
        </div>
      )}
    </section>
  );
}
