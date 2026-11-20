import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";

export const metadata: Metadata = { title: "Admin · LifeCity", robots: { index: false } };

// Admin only (private.admins in the database). Everyone else gets "page not found"; the data comes from admin functions
// that refuse anyone who isn't an admin, so the app still only uses the signed-in user's session.
async function AdminContent() {
  const { supabase } = await requireUser();
  const { data: isAdmin } = await supabase.rpc("am_admin");
  if (!isAdmin) notFound();
  const [{ data: days }, { data: players }, { data: me }] = await Promise.all([
    supabase.rpc("admin_signups", { p_days: 30 }),
    supabase.rpc("admin_players"),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  const tz = me?.timezone ?? "UTC";
  const rows = days ?? [];
  const list = players ?? [];
  const today = rows[0]?.day;
  const localDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)) : null);
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
  const sum = (n: number) => rows.slice(0, n).reduce((s, r) => s + r.signups, 0);
  const activeToday = list.filter((p) => localDay(p.last_checkoff) === today).length;
  const playedEver = list.filter((p) => p.checkoffs > 0).length;
  const tiles = [
    { label: "Players", value: list.length, note: `${playedEver} have checked off a task` },
    { label: "Signed up today", value: rows[0]?.signups ?? 0, note: `${rows[0]?.played ?? 0} of them played` },
    { label: "Last 7 days", value: sum(7), note: `${sum(30)} in the last 30 days` },
    { label: "Active today", value: activeToday, note: "checked off a task today" },
  ];
  const most = Math.max(1, ...rows.slice(0, 14).map((r) => r.signups));

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-3 sm:p-4">
            <dt className="text-xs font-medium text-muted">{t.label}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums">{formatCoins(t.value)}</dd>
            <dd className="text-xs text-muted">{t.note}</dd>
          </div>
        ))}
      </dl>

      <section className="card" aria-labelledby="days-h">
        <h2 id="days-h" className="font-semibold">Sign-ups, last 14 days</h2>
        <p className="text-xs text-muted">Bar: sign-ups that day. The number after the slash: how many of them checked off a task.</p>
        <ul className="mt-3 space-y-1.5">
          {rows.slice(0, 14).map((r) => (
            <li key={r.day} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="text-muted">
                {new Date(r.day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="h-3 rounded-full bg-raised" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.signups / most) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">
                {r.signups}
                <span className="text-muted"> / {r.played}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-0 sm:p-0" aria-labelledby="players-h">
        <h2 id="players-h" className="p-4 pb-2 font-semibold">Players ({list.length})</h2>
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.user_id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 font-semibold break-all">{p.email ?? "(no email)"}</p>
                <p className="text-xs text-muted">Signed up {when(p.signed_up)}</p>
              </div>
              <p className="text-xs break-words text-muted">
                {p.display_name ? `${p.display_name} · ` : ""}
                {p.city_name ?? "No city name"} · last sign-in {when(p.last_sign_in)}
              </p>
              <p className="mt-1 text-xs">
                {p.tasks} tasks · {p.checkoffs} check-offs{p.last_checkoff ? ` (last ${when(p.last_checkoff)})` : ""} · {p.buildings} buildings ·{" "}
                {formatCoins(p.population)} people · {formatCoins(Number(p.coins))} coins · {p.land ?? 8}×{p.land ?? 8} land · {p.friends} friends
                {p.tutorial_done ? " · finished Getting started" : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted">Sign-ups and how far each player has got. Only you can see this page.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AdminContent />
      </Suspense>
    </div>
  );
}
