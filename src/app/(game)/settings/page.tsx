import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings · Life City" };

async function SettingsContent() {
  const { email } = await requireUser();
  return <SettingsForms email={email} />;
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
