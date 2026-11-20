import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { FriendsBoard } from "./friends-board";
import { Leaderboard } from "./leaderboard";

export const metadata: Metadata = { title: "Friends · LifeCity" };

async function FriendsContent() {
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: friends }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("city_code, city_name, display_name").maybeSingle(),
    supabase.rpc("my_friends"),
    supabase.rpc("my_friend_requests"),
  ]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "life-city-five.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const code = profile?.city_code ?? "";
  return (
    <FriendsBoard
      code={code}
      cityName={profile?.city_name ?? "Click Here to Name City"}
      name={profile?.display_name ?? null}
      inviteUrl={`${proto}://${host}/signup?invite=${code}`}
      friends={(friends ?? []).map((f) => ({ ...f, population: Number(f.population), buildings: Number(f.buildings) }))}
      requests={(requests ?? []).map((r) => ({ ...r, population: Number(r.population) }))}
    />
  );
}

export default function FriendsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Friends</h1>
        <p className="text-sm text-muted">Share your city code, add friends by theirs, visit each other&apos;s cities, and see the top cities in LifeCity.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <FriendsContent />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted">Loading the top cities…</p>}>
        <Leaderboard />
      </Suspense>
    </div>
  );
}
