"use client";

// Getting started in the full-screen city: a small bubble under the top bar with the next step and how to do it.
import { Gift, Lightbulb, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";
import { claimReward, hideTutorial } from "../actions";
import { TUTORIAL_REWARD, TUTORIAL_STEPS, currentStep, type TutorialState } from "@/lib/tutorial";

export function TutorialCoach({ state, onReward }: { state: TutorialState; onReward: (coins: number) => void }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const next = currentStep(state);
  const n = next ? TUTORIAL_STEPS.indexOf(next) + 1 : TUTORIAL_STEPS.length;
  return (
    <div className="pointer-events-auto w-[min(22rem,100%)] rounded-2xl bg-surface/95 p-3 text-ink shadow-xl ring-2 ring-accent backdrop-blur" role="status" aria-label="Getting started">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          {next ? <Lightbulb className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Getting started · step {n} of {TUTORIAL_STEPS.length}</p>
          {next ? (
            <>
              <p className="font-semibold">{next.title}</p>
              <p className="text-sm break-words text-ink/90">
                {next.where === "tasks" ? "Tasks come first: they earn the coins you build with. Add one and check it off, then come back here." : next.hint?.(state) ?? next.how}
              </p>
              {next.where === "tasks" && (
                <a href="/tasks" className="btn-primary mt-2 min-h-9 px-3 py-1 text-sm">Go to Tasks</a>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold">Your town is alive!</p>
              <p className="text-sm text-ink/90">People live here and have somewhere to work. Here&apos;s a reward for setting it up.</p>
              <button
                type="button"
                className="btn-primary mt-2 min-h-9 px-3 py-1 text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await claimReward("tutorial");
                    if (r.ok) {
                      onReward(r.coins);
                      setGone(true);
                    }
                  })
                }
              >
                <Gift className="size-4" aria-hidden /> Claim {TUTORIAL_REWARD} coins
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label="Skip Getting started"
          title="Skip Getting started"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setGone(true);
              await hideTutorial();
            })
          }
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
