// The 10 most populous cities in LifeCity. Anyone on it can be visited (view only), like a friend's city.
import { Eye, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";

export async function Leaderboard() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("leaderboard");
  const rows = data ?? [];
  return (
    <section className="card p-0 sm:p-0" aria-labelledby="lb-h">
      <div className="flex items-center gap-2 p-4 pb-2">
        <Trophy className="size-5 text-coin" aria-hidden />
        <div>
          <h2 id="lb-h" className="font-semibold">Top cities</h2>
          <p className="text-xs text-muted">The 10 biggest cities in LifeCity by population. Tap Visit to look around.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">No cities with people yet. Build homes beside a road to be the first.</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.user_id} className={`flex items-center gap-3 px-4 py-2.5 ${r.is_me ? "bg-accent-soft" : ""}`}>
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  r.rank === 1 ? "bg-coin text-on-coin" : r.rank <= 3 ? "bg-raised text-ink ring-1 ring-coin/60" : "bg-raised text-muted"
                }`}
                aria-label={`Rank ${r.rank}`}
              >
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words">
                  {r.city_name}
                  {r.is_me && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-on-accent">You</span>}
                </p>
                <p className="text-xs break-words text-muted">
                  {r.display_name || "A LifeCity player"} · <Users className="inline size-3" aria-hidden /> {formatCoins(Number(r.population))} people
                  · {formatCoins(Number(r.buildings))} buildings
                </p>
              </div>
              {r.is_me ? (
                <a href="/play" className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-accent-text hover:bg-raised">
                  <Eye className="size-4" aria-hidden /> Open
                </a>
              ) : (
                <Link href={`/visit/${r.user_id}`} className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-accent-text hover:bg-raised">
                  <Eye className="size-4" aria-hidden /> Visit
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
