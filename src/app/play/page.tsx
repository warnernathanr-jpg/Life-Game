import type { Metadata } from "next";
import { Suspense } from "react";
import { CityLoader } from "../(game)/city/load";

export const metadata: Metadata = { title: "City (full screen) · LifeCity" };

// The full-screen city: its own page with nothing else on it (no header, tabs or scroll position to fight with),
// so it opens the same way every time. Exit goes back to /city.
export default function PlayPage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <Suspense fallback={<p className="p-4 text-sm text-muted">Loading your city…</p>}>
        <CityLoader standalone />
      </Suspense>
    </main>
  );
}
