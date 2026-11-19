import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { FocusTimer } from "./focus-timer";

export const metadata: Metadata = { title: "Focus · Life City" };

async function FocusPageContent() {
  const { supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone").maybeSingle();
  const tz = profile?.timezone ?? "UTC";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const { data: sessions } = await supabase
    .from("focus_sessions")
    .select("id, minutes, label, started_at, ends_at, status, coins, local_day")
    .or(`local_day.eq.${today},status.eq.running`)
    .order("started_at", { ascending: false })
    .limit(50);

  const list = sessions ?? [];
  const running = stillClaimable(list);
  const todays = list.filter((s) => s.local_day === today && s.status !== "running");
  const earned = todays.reduce((sum, s) => sum + s.coins, 0);
  const minutes = todays.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.minutes, 0);

  return (
    <FocusTimer
      running={running ? { id: running.id, endsAt: running.ends_at, startedAt: running.started_at, minutes: running.minutes, label: running.label } : null}
      earnedToday={earned}
      minutesToday={minutes}
      history={todays.map((s) => ({ id: s.id, minutes: s.minutes, label: s.label, status: s.status, coins: s.coins, startedAt: s.started_at }))}
      timezone={tz}
    />
  );
}

/** The running session, if it can still be finished (it ended less than the 10-minute claim window ago). */
function stillClaimable<T extends { status: string; ends_at: string }>(list: T[]): T | null {
  const now = Date.now();
  return list.find((s) => s.status === "running" && new Date(s.ends_at).getTime() + 10 * 60_000 > now) ?? null;
}

export default function FocusPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <FocusPageContent />
    </Suspense>
  );
}
