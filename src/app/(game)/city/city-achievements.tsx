// City achievements on the City page (building, land, friends): each pays coins, collected one at a time.
import { Award } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ACHIEVEMENTS, CITY_GROUP, coinsToCollect } from "@/lib/achievements";
import { formatCoins } from "@/lib/game";
import { BadgeGrid } from "../achievements/achievements-view";

export async function CityAchievements() {
  const { supabase } = await requireUser();
  await supabase.rpc("sync_achievements"); // save anything newly earned first
  const [{ data: earned }, { data: profile }] = await Promise.all([
    supabase.from("achievements").select("id, achieved_at, seen, claimed_at"),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);
  const list = ACHIEVEMENTS.filter((a) => a.group === CITY_GROUP);
  const rows = earned ?? [];
  const got = list.filter((a) => rows.some((r) => r.id === a.id)).length;
  const toCollect = coinsToCollect(rows, "city");
  return (
    <section className="card mt-6" aria-labelledby="city-ach-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="city-ach-h" className="flex items-center gap-2 font-semibold">
          <Award className="size-5 text-coin" aria-hidden /> City achievements
        </h2>
        <p className="text-sm text-muted">{got} of {list.length} earned</p>
      </div>
      {toCollect.coins > 0 && (
        <p className="mt-2 rounded-lg bg-coin/15 px-3 py-2 text-sm">
          <span className="font-semibold text-coin">{formatCoins(toCollect.coins)} coins</span> waiting. Tap Collect on each badge.
        </p>
      )}
      <BadgeGrid list={list} earned={rows} tz={profile?.timezone ?? "UTC"} />
    </section>
  );
}
