import { Building2, Coins, Settings, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatCoins } from "@/lib/game";
import { RewardPrompts } from "@/components/reward-prompts";
import { BottomNav, TopNav } from "./nav";
import { InviteRedeemer } from "@/components/invite";
import { GettingStarted } from "@/components/getting-started";
import { tutorialActive } from "@/lib/tutorial";

export default function GameLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* .app-scroll: in the home-screen app on phones this is its own scrolling area, so the bottom bar (outside it) never
          moves (see globals.css). Elsewhere it's just a wrapper and the page scrolls as usual. */}
      <div className="app-scroll flex flex-1 flex-col">
      <header className="shrink-0 bg-header text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/city" className="flex items-center gap-1.5 font-bold">
            <Building2 className="size-5" aria-hidden />
            <span>LifeCity</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<span className="h-9 w-20 rounded-full bg-white/10" />}>
              <CoinBadge />
            </Suspense>
            <Suspense fallback={<FriendsLink count={0} />}>
              <FriendsBadge />
            </Suspense>
            <Link href="/settings" aria-label="Settings" className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10">
              <Settings className="size-4" aria-hidden />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </div>
        </div>
      </header>
      {/* Room at the bottom on phones for the tab bar. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(7rem+var(--nav-pad,env(safe-area-inset-bottom,0px)))] md:pb-8">
        <Suspense>
          <TutorialCard />
        </Suspense>
        {children}
      </main>
      </div>
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

/** Friends link, with a red count of friend requests waiting for you. */
function FriendsLink({ count }: { count: number }) {
  return (
    <Link
      href="/friends"
      aria-label={count > 0 ? `Friends, ${count} friend request${count === 1 ? "" : "s"}` : "Friends"}
      className="relative flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10"
    >
      <Users className="size-4" aria-hidden />
      <span className="hidden sm:inline">Friends</span>
      {count > 0 && (
        <span aria-hidden className="absolute -top-1 left-4 flex min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-[18px] font-bold text-white ring-2 ring-header sm:static sm:ring-0">
          {count}
        </span>
      )}
    </Link>
  );
}

async function FriendsBadge() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("my_friend_requests");
  return <FriendsLink count={(data ?? []).filter((r) => r.direction === "in").length} />;
}

/** The Getting started guide, for new players until it's finished or skipped. */
async function TutorialCard() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("my_tutorial").maybeSingle();
  return tutorialActive(data) ? <GettingStarted state={data} /> : null;
}
