import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";

export const metadata: Metadata = { title: "Coins · Life City" };

const KIND_ICON = { task: "✅", task_undo: "↩️", building: "🏗️", building_sold: "🧱", land: "🗺️", bonus: "🎁" } as const;

async function CoinsPageContent() {
  const { supabase } = await requireUser();
  const [{ data: rows }, { data: progress }, { data: profile }] = await Promise.all([
    supabase.from("coin_ledger").select("id, amount, kind, reason, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200),
    supabase.rpc("my_progress").maybeSingle(),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  const ledger = rows ?? [];
  const earned = ledger.filter((r) => r.amount > 0 && r.kind !== "building_sold").reduce((s, r) => s + Number(r.amount), 0);
  const spent = ledger.filter((r) => r.kind === "building" || r.kind === "land").reduce((s, r) => s - Number(r.amount), 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: profile?.timezone ?? "UTC",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Coins</h1>
      <dl className="grid grid-cols-3 gap-3">
        <div className="card"><dt className="text-xs text-muted">Balance</dt><dd className="text-xl font-bold text-coin">🪙 {formatCoins(Number(progress?.balance ?? 0))}</dd></div>
        <div className="card"><dt className="text-xs text-muted">Earned</dt><dd className="text-xl font-bold text-good">+{formatCoins(earned)}</dd></div>
        <div className="card"><dt className="text-xs text-muted">Spent</dt><dd className="text-xl font-bold">{formatCoins(spent)}</dd></div>
      </dl>
      <section className="card p-0 sm:p-0" aria-labelledby="hist-h">
        <h2 id="hist-h" className="px-4 pt-4 font-semibold sm:px-5">History</h2>
        {ledger.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted sm:px-5">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {ledger.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span aria-hidden className="text-lg">{KIND_ICON[r.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.reason}</span>
                  <span className="block text-xs text-muted">{fmt.format(new Date(r.created_at))}</span>
                </span>
                <span className={`shrink-0 font-bold ${r.amount > 0 ? "text-good" : "text-ink"}`}>
                  {r.amount > 0 ? "+" : "−"}{formatCoins(Math.abs(Number(r.amount)))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {ledger.length === 200 && <p className="text-center text-xs text-muted">Showing the latest 200.</p>}
    </div>
  );
}

export default function CoinsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <CoinsPageContent />
    </Suspense>
  );
}
