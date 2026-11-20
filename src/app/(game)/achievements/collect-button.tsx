"use client";

// Collects one badge's coins (claim_achievement in the database). Each badge has its own button.
import { Coins } from "lucide-react";
import { useState, useTransition } from "react";
import { claimAchievement } from "../actions";
import { formatCoins } from "@/lib/game";

export function CollectButton({ id, coins }: { id: string; coins: number }) {
  const [pending, start] = useTransition();
  const [got, setGot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (got) {
    return <p role="status" className="mt-1 text-[11px] font-semibold text-good">+{formatCoins(coins)} coins collected!</p>;
  }
  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-coin px-2.5 py-1 text-xs font-bold text-on-coin shadow hover:brightness-105 disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await claimAchievement(id);
            if (r.ok) setGot(true);
            else setError(r.error);
          })
        }
      >
        <Coins className="size-3.5" aria-hidden /> Collect {formatCoins(coins)}
      </button>
      {error && <p role="alert" className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
