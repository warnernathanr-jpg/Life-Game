"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatCoins } from "@/lib/game";
import { completeFocus, failFocus, startFocus } from "../actions";

/** Leaving the page (another app or tab) for longer than this ends the session. */
const AWAY_LIMIT_MS = 10_000;
const QUICK = [15, 25, 45, 60];

type Running = { id: string; endsAt: string; startedAt: string; minutes: number; label: string | null };
type HistoryItem = { id: string; minutes: number; label: string | null; status: string; coins: number; startedAt: string };
type Phase =
  | { kind: "idle" }
  | { kind: "running"; session: Running; offset: number }
  | { kind: "won"; coins: number; minutes: number }
  | { kind: "lost"; reason: "left" | "gave_up"; minutes: number };

export function FocusTimer(props: {
  running: Running | null;
  earnedToday: number;
  cap: number;
  minutesToday: number;
  history: HistoryItem[];
  timezone: string;
}) {
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<Phase>(props.running ? { kind: "running", session: props.running, offset: 0 } : { kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const capLeft = Math.max(0, props.cap - props.earnedToday);
  const reward = Math.min(minutes, capLeft);

  function begin() {
    setError(null);
    start(async () => {
      const r = await startFocus(minutes, label);
      if (!r.ok) return setError(r.error);
      // Clock offset so the countdown follows the server's time, not a wrong phone clock.
      const offset = new Date(r.serverNow).getTime() - Date.now();
      setPhase({ kind: "running", session: { id: r.id, endsAt: r.endsAt, startedAt: r.startedAt, minutes, label: label.trim() || null }, offset });
    });
  }

  if (phase.kind === "running") {
    return (
      <RunningView
        session={phase.session}
        offset={phase.offset}
        onWin={(coins) => setPhase({ kind: "won", coins, minutes: phase.session.minutes })}
        onLose={(reason) => setPhase({ kind: "lost", reason, minutes: phase.session.minutes })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Focus</h1>
        <p className="text-sm text-muted">Put your phone down and earn 1 coin for every minute you stay focused.</p>
      </div>

      {phase.kind === "won" && (
        <div role="status" className="card border-good/40 bg-good-soft text-center">
          <p className="text-4xl" aria-hidden>🎉</p>
          <p className="mt-1 text-lg font-bold">You focused for {phase.minutes} minutes!</p>
          <p className="text-good">{phase.coins > 0 ? `+${formatCoins(phase.coins)} coins` : "You've reached today's focus coin limit, but well done."}</p>
          <Link href="/city" className="btn-secondary mt-3">🏗️ Spend in your city</Link>
        </div>
      )}
      {phase.kind === "lost" && (
        <div role="status" className="card border-bad/40 bg-bad-soft text-center">
          <p className="text-lg font-bold">{phase.reason === "left" ? "You left the page, so the session ended." : "Session stopped."}</p>
          <p className="text-sm text-muted">No coins this time. Try a shorter session and work up from there.</p>
        </div>
      )}

      <section className="card space-y-4" aria-labelledby="pick-h">
        <h2 id="pick-h" className="font-semibold">How long?</h2>
        <div className="text-center">
          <p className="text-5xl font-bold tabular-nums">{minutes}<span className="text-xl font-medium text-muted"> min</span></p>
          <p className="mt-1 text-sm font-semibold text-coin">
            {capLeft === 0 ? "Daily focus coin limit reached" : `+${reward} coins`}
          </p>
        </div>
        <label className="block">
          <span className="sr-only">Minutes</span>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full accent-[var(--t-accent)]"
            aria-valuetext={`${minutes} minutes`}
          />
          <span className="flex justify-between text-xs text-faint" aria-hidden><span>5</span><span>60</span></span>
        </label>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Quick picks">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={minutes === q}
              onClick={() => setMinutes(q)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${minutes === q ? "bg-accent text-on-accent" : "bg-raised text-ink hover:bg-line"}`}
            >
              {q} min
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm font-medium text-ink">What are you focusing on? <span className="font-normal text-muted">(optional)</span></span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Study for the exam" className="input mt-1" />
        </label>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button type="button" className="btn-primary w-full text-lg" disabled={pending} onClick={begin}>
          {pending ? "Starting…" : `Start ${minutes}-minute focus`}
        </button>
        <ul className="space-y-1 text-xs text-muted">
          <li>📱 Leave this page open and put your phone face down. The screen stays on while you focus.</li>
          <li>🚪 Switching to another app or tab for more than 10 seconds ends the session with no coins.</li>
          <li>🪙 1 coin per minute, up to {props.cap} focus coins a day (separate from task coins).</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="today-h">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="today-h" className="font-semibold">Today</h2>
          <p className="text-sm text-muted">
            {props.minutesToday} min focused · <span className="font-semibold text-coin">{props.earnedToday}</span> / {props.cap} coins
          </p>
        </div>
        {props.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No sessions yet today.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {props.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                <span aria-hidden>{h.status === "completed" ? "✅" : "✖️"}</span>
                <span className="min-w-0 flex-1 truncate">
                  {h.minutes} min{h.label ? ` · ${h.label}` : ""}
                  <span className="block text-xs text-muted">
                    {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: props.timezone }).format(new Date(h.startedAt))}
                    {h.status === "completed" ? "" : h.status === "failed" ? " · ended early" : " · not finished"}
                  </span>
                </span>
                {h.status === "completed" && <span className="font-bold text-coin">+{h.coins}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunningView({
  session,
  offset,
  onWin,
  onLose,
}: {
  session: Running;
  offset: number;
  onWin: (coins: number) => void;
  onLose: (reason: "left" | "gave_up") => void;
}) {
  const endsAt = new Date(session.endsAt).getTime();
  const total = session.minutes * 60_000;
  // Starts empty so the server and browser render the same first frame; the tick fills it in.
  const [now, setNow] = useState<number | null>(null);
  const [awayWarning, setAwayWarning] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const finished = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const remaining = now === null ? total : Math.max(0, endsAt - now);

  const lose = useCallback(
    (reason: "left" | "gave_up") => {
      if (finished.current) return;
      finished.current = true;
      void failFocus(session.id);
      onLose(reason);
    },
    [session.id, onLose],
  );

  // Tick.
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [offset]);

  // Claim when time is up (retry briefly if the server's clock says "not yet").
  useEffect(() => {
    if (now === null || remaining > 0 || finished.current) return;
    finished.current = true;
    let tries = 0;
    async function claim() {
      const r = await completeFocus(session.id);
      if (r.ok) {
        navigator.vibrate?.([200, 100, 200]);
        onWin(r.coins);
      } else if ("tooEarly" in r && tries++ < 5) {
        setTimeout(claim, 1500);
      } else {
        setClaimError(r.error);
      }
    }
    void claim();
  }, [now, remaining, session.id, onWin]);

  // Leaving the page: allowed for up to 10 seconds (a notification, a slip of the thumb).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (away > AWAY_LIMIT_MS && Date.now() + offset < endsAt) lose("left");
        else if (away > 1000) setAwayWarning(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [lose, offset, endsAt]);

  // Keep the screen on (where the browser supports it), and warn before closing the page.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    }
    void acquire();
    const reacquire = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", reacquire);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!finished.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      void lock?.release().catch(() => {});
      document.removeEventListener("visibilitychange", reacquire);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const progress = 1 - remaining / total;
  const R = 110;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-4 text-center">
      <p className="text-sm font-medium text-muted">{session.label ?? "Focusing"}</p>
      <div className="relative">
        <svg width="260" height="260" viewBox="0 0 260 260" role="img" aria-label={`${mm} minutes ${ss} seconds left`}>
          <circle cx="130" cy="130" r={R} fill="none" stroke="var(--t-raised)" strokeWidth="14" />
          <circle
            cx="130"
            cy="130"
            r={R}
            fill="none"
            stroke="var(--t-accent)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 130 130)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold tabular-nums" aria-live="off">
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
          <span className="mt-1 text-sm font-semibold text-coin">+{session.minutes} coins</span>
        </div>
      </div>
      {remaining > 0 ? (
        <>
          <p className="max-w-sm text-sm text-muted">Phone face down, this page open. Leaving it for more than 10 seconds ends the session.</p>
          {awayWarning && (
            <p role="alert" className="rounded-lg bg-coin-soft px-3 py-2 text-sm text-ink">
              You left the page for a moment. Stay here to keep your coins.
            </p>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (window.confirm("Stop now? You won't get coins for this session.")) lose("gave_up");
            }}
          >
            Give up
          </button>
        </>
      ) : (
        <p role="status" className="text-sm text-muted">{claimError ?? "Time! Adding your coins…"}</p>
      )}
    </div>
  );
}
