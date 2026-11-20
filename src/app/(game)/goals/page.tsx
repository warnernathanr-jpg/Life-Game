import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { GoalsBoard } from "./goals-board";

export const metadata: Metadata = { title: "Goals · LifeCity" };

async function GoalsContent() {
  const { supabase } = await requireUser();
  const [{ data: goals }, { data: steps }, { data: profile }] = await Promise.all([
    supabase.from("goals").select("*").order("target_date"),
    supabase.from("goal_steps").select("*").order("position"),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: profile?.timezone ?? "UTC" }).format(new Date());
  return <GoalsBoard goals={goals ?? []} steps={steps ?? []} today={today} />;
}

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Goals</h1>
        <p className="text-sm text-muted">Bigger things you&apos;re working toward, with a date and the steps to get there.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading your goals…</p>}>
        <GoalsContent />
      </Suspense>
    </div>
  );
}
