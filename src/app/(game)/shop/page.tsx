import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AreaPoints } from "@/components/area-points";
import { requireUser } from "@/lib/auth";
import { AREA_BY_ID, CATEGORIES, CATEGORY_BY_ID, formatCoins, nextUnlocks, pointsToUnlock } from "@/lib/game";
import { Effects } from "../city/panels";

export const metadata: Metadata = { title: "Shop · Life City" };

async function ShopContent() {
  const { supabase } = await requireUser();
  const [{ data: types }, { data: progress }] = await Promise.all([
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.rpc("my_progress").maybeSingle(),
  ]);
  const all = types ?? [];
  const balance = Number(progress?.balance ?? 0);
  // Roads and landscaping first, then the four building categories.
  const order = ["road", "landscape", "residential", "commercial", "industrial", "service"] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Shop</h1>
          <p className="text-sm text-muted">
            Buy with coins, unlock with area points. Pick something to build and place it in your city.
          </p>
        </div>
        {order.map((cat) => {
          const items = all.filter((t) => t.category === cat);
          if (items.length === 0) return null;
          const c = CATEGORY_BY_ID[cat] ?? CATEGORIES[0];
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`} className="space-y-2">
              <h2 id={`cat-${cat}`} className="flex items-center gap-2 font-semibold">
                <span className={`size-3 rounded border-2 ${c.tile}`} aria-hidden />
                {c.label}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((t) => {
                  const remaining = pointsToUnlock(t, progress ?? null);
                  const locked = remaining > 0;
                  const short = balance < t.cost;
                  const area = t.unlock_area ? AREA_BY_ID[t.unlock_area] : null;
                  return (
                    <li key={t.id} className={`card flex gap-3 p-3 sm:p-3 ${locked ? "opacity-80" : ""}`}>
                      <span
                        aria-hidden
                        className={`flex size-14 shrink-0 items-center justify-center rounded-xl border-2 text-3xl ${c.tile} ${locked ? "grayscale" : ""}`}
                      >
                        {t.icon}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">{t.name}</p>
                          <p className={`shrink-0 text-sm font-bold ${short && !locked ? "text-bad" : "text-coin"}`}>
                            🪙 {formatCoins(t.cost)}
                            {t.category === "road" && <span className="font-normal"> / tile</span>}
                          </p>
                        </div>
                        <p className="text-xs text-muted">{t.description}</p>
                        <Effects t={t} />
                        {locked && area ? (
                          <div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                              <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${Math.min(100, ((t.unlock_points! - remaining) / t.unlock_points!) * 100)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              🔒 {remaining} more {area.icon} {area.label} points to unlock
                            </p>
                          </div>
                        ) : (
                          <Link
                            href={`/city?place=${t.id}`}
                            className="btn-primary min-h-9 px-3 py-1 text-sm"
                            aria-label={`Build ${t.name}`}
                          >
                            {short ? `Need ${formatCoins(t.cost - balance)} more coins` : "Build"}
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <aside className="space-y-4">
        <section className="card" aria-labelledby="bal-h">
          <h2 id="bal-h" className="text-sm font-semibold text-muted">Your coins</h2>
          <p className="mt-1 text-3xl font-bold text-coin">🪙 {formatCoins(balance)}</p>
          <Link href="/tasks" className="btn-secondary mt-3 w-full">✅ Earn more with tasks</Link>
        </section>
        <section className="card" aria-labelledby="pts-h">
          <h2 id="pts-h" className="font-semibold">Area points</h2>
          <p className="mb-3 text-xs text-muted">Earned with every check-off and focus session. They unlock buildings and are never spent.</p>
          <AreaPoints unlocks={nextUnlocks(all, progress ?? null)} />
        </section>
      </aside>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading the shop…</p>}>
      <ShopContent />
    </Suspense>
  );
}
