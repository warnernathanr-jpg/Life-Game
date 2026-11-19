import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";
import { signOut } from "../(auth)/actions";
import { Nav } from "./nav";

export default function GameLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="bg-emerald-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/today" className="flex items-center gap-1.5 font-bold">
            <span aria-hidden>🏙️</span>
            <span className="hidden sm:inline">Life City</span>
          </Link>
          <Nav />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<span className="h-9 w-20 rounded-full bg-white/10" />}>
              <CoinBadge />
            </Suspense>
            <form action={signOut}>
              <button className="min-h-9 rounded-lg px-2 text-sm text-emerald-50 hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

async function CoinBadge() {
  const { supabase } = await requireUser();
  const { data: progress } = await supabase.rpc("my_progress").maybeSingle();
  const balance = Number(progress?.balance ?? 0);
  return (
      <span
        className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-bold ${
          balance < 0 ? "bg-red-100 text-red-900" : "bg-amber-300 text-amber-950"
        }`}
        aria-label={`${formatCoins(balance)} coins`}
      >
        <span aria-hidden>🪙</span> {formatCoins(balance)}
      </span>
  );
}
