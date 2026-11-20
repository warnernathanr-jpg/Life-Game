// Loads everything the city screen needs (used by /city and the full-screen /play page).
import { requireUser } from "@/lib/auth";
import { CityBoard } from "./city-board";

export async function CityLoader({ place, standalone }: { place?: string; standalone?: boolean }) {
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: placed }, { data: types }, { data: progress }] = await Promise.all([
    supabase.from("profiles").select("city_name, city_size, land_purchases").maybeSingle(),
    supabase.from("placed_buildings").select("id, type_id, x, y, price_paid, facing, rotated, color_seed").order("created_at"),
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.rpc("my_progress").maybeSingle(),
  ]);

  if (!profile || !types) {
    return <p className="card">Your city couldn&apos;t be loaded. Refresh to try again.</p>;
  }

  return (
    <CityBoard
      cityName={profile.city_name}
      size={profile.city_size}
      landPurchases={profile.land_purchases}
      placed={placed ?? []}
      types={types}
      progress={progress ?? null}
      balance={Number(progress?.balance ?? 0)}
      initialPlace={place}
      standalone={standalone}
    />
  );
}
