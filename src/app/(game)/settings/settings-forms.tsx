"use client";

import { KeyRound, LogOut, RotateCcw, TriangleAlert, UserRound, Volume2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm";
import { ThemeSettings } from "@/components/theme-picker";
import { playSfx, setSfxEnabled, sfxEnabled } from "@/lib/sfx";
import { signOut } from "../../(auth)/actions";
import { changePassword, resetProgress, setDisplayName, type PasswordState } from "../actions";

export function SettingsForms({ email, name }: { email: string; name: string }) {
  const [nameValue, setNameValue] = useState(name);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [savingName, startName] = useTransition();
  const [pwState, pwAction, pwPending] = useActionState<PasswordState, FormData>(changePassword, {});
  const pwForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (pwState.done) pwForm.current?.reset();
  }, [pwState.done]);

  const [confirm, confirmDialog] = useConfirm();
  const [words, setWords] = useState("");
  const [resetting, startReset] = useTransition();
  const [resetMsg, setResetMsg] = useState<{ text: string; ok: boolean } | null>(null);

  return (
    <div className="space-y-6">
      {confirmDialog}
      <section className="card" aria-labelledby="acct-h">
        <h2 id="acct-h" className="flex items-center gap-2 font-semibold">
          <UserRound className="size-4" aria-hidden /> Account
        </h2>
        <p className="mt-1 text-sm text-muted">Signed in as <span className="font-medium text-ink">{email}</span></p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            startName(async () => {
              const r = await setDisplayName(nameValue);
              setNameMsg(r.ok ? "Saved." : r.error);
            });
          }}
        >
          <label htmlFor="display-name" className="text-sm font-medium">Your name</label>
          <p className="text-xs text-muted">Friends see it with your city name when they visit.</p>
          <div className="mt-1 flex gap-2">
            <input id="display-name" value={nameValue} onChange={(e) => setNameValue(e.target.value)} maxLength={40} placeholder="e.g. Nacho" className="input" />
            <button type="submit" className="btn-secondary shrink-0" disabled={savingName}>Save</button>
          </div>
          {nameMsg && <p role="status" className="mt-1 text-sm text-good">{nameMsg}</p>}
        </form>
        <form action={signOut} className="mt-3">
          <button type="submit" className="btn-secondary">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </section>

      <ThemeSettings />
      <SoundSettings />

      <section className="card" aria-labelledby="pw-h">
        <h2 id="pw-h" className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" aria-hidden /> Change password
        </h2>
        <form ref={pwForm} action={pwAction} className="mt-3 space-y-3" noValidate>
          <label className="block">
            <span className="text-sm font-medium">New password</span>
            <input type="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} required className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">New password again</span>
            <input type="password" name="password2" autoComplete="new-password" minLength={8} maxLength={72} required className="input mt-1" />
          </label>
          <button type="submit" disabled={pwPending} className="btn-primary">
            {pwPending ? "Saving…" : "Change password"}
          </button>
          {pwState.error && <p role="alert" className="text-sm text-bad">{pwState.error}</p>}
          {pwState.done && !pwState.error && <p role="status" className="text-sm text-good">Your password has been changed.</p>}
        </form>
      </section>

      <section className="card border border-bad/40" aria-labelledby="reset-h">
        <h2 id="reset-h" className="flex items-center gap-2 font-semibold text-bad">
          <TriangleAlert className="size-4" aria-hidden /> Start over
        </h2>
        <p className="mt-1 text-sm text-ink">
          This permanently deletes <strong>your whole city and its milestones, every task and check-off, your goals, focus sessions and coin history</strong>, and brings back the Getting started guide.
          You start again with 100 coins and an empty 8×8 city. It can&apos;t be undone.
        </p>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Type <span className="font-mono">START OVER</span> to confirm</span>
          <input value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" className="input mt-1" />
        </label>
        <button
          type="button"
          disabled={words !== "START OVER" || resetting}
          onClick={async () => {
            const ok = await confirm({
              title: "Delete all your progress?",
              message: "Your city, tasks, goals and coin history will be gone for good.",
              confirmLabel: "Delete everything",
              tone: "danger",
            });
            if (!ok) return;
            startReset(async () => {
              const r = await resetProgress(words);
              setResetMsg(r.ok ? { text: "Done. You're starting fresh with 100 coins.", ok: true } : { text: r.error, ok: false });
              if (r.ok) setWords("");
            });
          }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="size-4" aria-hidden /> {resetting ? "Deleting…" : "Start over"}
        </button>
        {resetMsg && <p role="status" className={`mt-2 text-sm ${resetMsg.ok ? "text-good" : "text-bad"}`}>{resetMsg.text}</p>}
      </section>
    </div>
  );
}

/** Sound effects in the city (button clicks, building, demolishing), remembered on this device. */
function SoundSettings() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(sfxEnabled());
  }, []);
  return (
    <section className="card" aria-labelledby="sfx-h">
      <h2 id="sfx-h" className="flex items-center gap-2 font-semibold">
        <Volume2 className="size-4" aria-hidden /> Sounds
      </h2>
      <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm">
          Button and building sounds in the city
          <span className="block text-xs text-muted">Music has its own button in full screen.</span>
        </span>
        <input
          type="checkbox"
          className="size-5 accent-[var(--t-accent)]"
          checked={on}
          onChange={(e) => {
            setSfxEnabled(e.target.checked);
            setOn(e.target.checked);
            if (e.target.checked) playSfx("build");
          }}
        />
      </label>
    </section>
  );
}
