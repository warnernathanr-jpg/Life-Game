import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";
import { signOut } from "../(auth)/actions";
import { RewardPrompts } from "@/components/reward-prompts";
import { ThemePicker } from "@/components/theme-picker";
import { BottomNav, TopNav } from "./nav";

export default function GameLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="bg-header text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/city" className="flex items-center gap-1.5 font-bold">
            <span aria-hidden>🏙️</span>
            <span>Life City</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<span className="h-9 w-20 rounded-full bg-white/10" />}>
              <CoinBadge />
            </Suspense>
            <ThemePicker />
            <form action={signOut}>
              <button className="min-h-9 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {/* Room at the bottom on phones for the tab bar. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-8">{children}</main>
      <BottomNav />
      <Suspense>
        <Rewards />
      </Suspense>
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
          balance < 0 ? "bg-bad-soft text-bad" : "bg-coin text-on-coin"
        }`}
        aria-label={`${formatCoins(balance)} coins`}
      >
        <span aria-hidden>🪙</span> {formatCoins(balance)}
      </span>
  );
}

/** Which one-time rewards are already claimed, for the home screen / notifications popups. */
async function Rewards() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_rewards").select("reward");
  return <RewardPrompts claimed={(data ?? []).map((r) => r.reward)} />;
}
