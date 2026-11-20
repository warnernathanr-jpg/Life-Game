"use client";

// Collects the coins of every earned badge not collected yet (claim_achievements in the database).
import { Coins } from "lucide-react";
import { useState, useTransition } from "react";
import { claimAchievements } from "../actions";
import { formatCoins } from "@/lib/game";

export function CollectButton({ coins, badges }: { coins: number; badges: number }) {
  const [pending, start] = useTransition();
  const [got, setGot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (got !== null) {
    return <p role="status" className="text-sm font-semibold text-good">+{formatCoins(got)} coins collected!</p>;
  }
  if (coins <= 0) return null;
  return (
    <div>
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-coin px-3 py-1.5 text-sm font-bold text-on-coin shadow hover:brightness-105 disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await claimAchievements();
            if (r.ok) setGot(r.coins);
            else setError(r.error);
          })
        }
      >
        <Coins className="size-4" aria-hidden /> Collect {formatCoins(coins)} coins
        <span className="font-normal">({badges} badge{badges === 1 ? "" : "s"})</span>
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
