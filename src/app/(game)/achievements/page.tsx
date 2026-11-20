import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { AchievementsView, type TimelineRow } from "./achievements-view";

export const metadata: Metadata = { title: "Achievements · LifeCity" };

async function Content() {
  const { supabase } = await requireUser();
  await supabase.rpc("sync_achievements"); // save anything newly earned first
  const [{ data: earned }, { data: timeline }, { data: profile }] = await Promise.all([
    supabase.from("achievements").select("id, achieved_at, seen, claimed_at"),
    supabase.rpc("my_timeline"),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  return <AchievementsView earned={earned ?? []} timeline={(timeline ?? []) as TimelineRow[]} tz={profile?.timezone ?? "UTC"} />;
}

export default function AchievementsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/stats" className="text-sm text-accent-text hover:underline">← Stats</Link>
        <h1 className="text-2xl font-bold">Achievements</h1>
        <p className="text-sm text-muted">Badges you&apos;ve earned and the story of your progress. Nothing here is ever taken away.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}
