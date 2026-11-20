import { Building2, Coins, Settings, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";
import { RewardPrompts } from "@/components/reward-prompts";
import { BottomNav, TopNav } from "./nav";
import { InviteRedeemer } from "@/components/invite";

export default function GameLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="bg-header text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/city" className="flex items-center gap-1.5 font-bold">
            <Building2 className="size-5" aria-hidden />
            <span>Life City</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<span className="h-9 w-20 rounded-full bg-white/10" />}>
              <CoinBadge />
            </Suspense>
            <Link href="/friends" aria-label="Friends" className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10">
              <Users className="size-4" aria-hidden />
              <span className="hidden sm:inline">Friends</span>
            </Link>
            <Link href="/settings" aria-label="Settings" className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10">
              <Settings className="size-4" aria-hidden />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </div>
        </div>
      </header>
      {/* Room at the bottom on phones for the tab bar. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-8">{children}</main>
      <BottomNav />
      <InviteRedeemer />
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
        <Coins className="size-4" aria-hidden /> {formatCoins(balance)}
      </span>
  );
}

/** Which one-time rewards are already claimed, for the home screen / notifications popups. */
async function Rewards() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_rewards").select("reward");
  return <RewardPrompts claimed={(data ?? []).map((r) => r.reward)} />;
}
