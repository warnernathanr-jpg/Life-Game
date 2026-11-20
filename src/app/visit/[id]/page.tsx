import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { shareOrigin } from "@/lib/site";
import type { PlacedBuildingRow, RoadControlKind } from "@/lib/database.types";
import { CityBoard } from "../../(game)/city/city-board";

export const metadata: Metadata = { title: "Visiting a city · LifeCity" };

type FriendCity = {
  city_name: string;
  display_name: string | null;
  city_size: number;
  placed: Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "facing" | "rotated" | "color_seed">[];
  controls: { x: number; y: number; kind: RoadControlKind }[];
};

async function Visit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data, error }, { data: types }, { data: me }] = await Promise.all([
    supabase.rpc("friend_city", { p_friend: id }),
    supabase.from("building_types").select("*").order("sort_order"),
    supabase.from("profiles").select("city_code").maybeSingle(),
  ]);
  if (error || !data || !types) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold">This city isn&apos;t on your friends list or the top 10.</p>
        <Link href="/friends" className="btn-primary">Back to friends</Link>
      </div>
    );
  }
  const city = data as FriendCity;
  const h = await headers();
  const origin = shareOrigin(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  return (
    <CityBoard
      cityName={city.city_name}
      size={city.city_size}
      landPurchases={0}
      placed={city.placed.map((b) => ({ ...b, price_paid: 0 }))}
      controls={city.controls}
      types={types}
      progress={null}
      balance={0}
      standalone
      visit={{ owner: city.display_name, inviteUrl: `${origin}/signup?invite=${me?.city_code ?? ""}` }}
    />
  );
}

export default function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <Suspense fallback={<p className="p-4 text-sm text-muted">Loading their city…</p>}>
        <Visit params={params} />
      </Suspense>
    </main>
  );
}
