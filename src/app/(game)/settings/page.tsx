import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings · LifeCity" };

async function SettingsContent() {
  const { email, supabase } = await requireUser();
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("display_name").maybeSingle(),
    supabase.rpc("am_admin"),
  ]);
  return (
    <>
      {isAdmin && (
        <Link href="/admin" className="card flex items-center justify-between gap-2 border-accent/60 hover:border-accent">
          <span>
            <span className="block font-semibold">Admin</span>
            <span className="block text-sm text-muted">Sign-ups and players (only you can see this)</span>
          </span>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      )}
      <SettingsForms email={email} name={profile?.display_name ?? ""} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
