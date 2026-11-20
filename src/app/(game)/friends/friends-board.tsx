"use client";

import { Building2, Copy, Eye, Share2, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm";
import { formatCoins } from "@/lib/game";
import { addFriend, removeFriend } from "../actions";

type Friend = { friend_id: string; city_name: string; city_code: string; city_size: number; population: number; buildings: number; display_name: string | null };

export function FriendsBoard({
  code,
  cityName,
  name,
  inviteUrl,
  friends,
}: {
  code: string;
  cityName: string;
  name: string | null;
  inviteUrl: string;
  friends: Friend[];
}) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: `${what} copied.`, ok: true });
    } catch {
      setMessage({ text, ok: true });
    }
  }

  async function share() {
    const text = `I'm building ${cityName} by getting things done in Life City. Come build your own city and add me: my code is ${code}.`;
    try {
      if (navigator.share) return await navigator.share({ title: "Life City", text, url: inviteUrl });
    } catch {
      return;
    }
    copy(`${text} ${inviteUrl}`, "Invite");
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <section className="card" aria-labelledby="code-h">
        <h2 id="code-h" className="font-semibold">Your city code</h2>
        <p className="text-sm text-muted">
          Friends type this to add <span className="font-medium text-ink">{cityName}</span>
          {name ? <> (shown as <span className="font-medium text-ink">{name}&apos;s city</span>)</> : <>. Set your name in Settings so they know it&apos;s you</>}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-raised px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em]">{code}</span>
          <button type="button" className="btn-secondary" onClick={() => copy(code, "Code")}>
            <Copy className="size-4" aria-hidden /> Copy code
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="invite-h">
        <h2 id="invite-h" className="font-semibold">Invite friends to Life City</h2>
        <p className="text-sm text-muted">Send a link: when they sign up with it, your city is added to their friends.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={share}>
            <Share2 className="size-4" aria-hidden /> Share invite link
          </button>
          <button type="button" className="btn-secondary" onClick={() => copy(inviteUrl, "Link")}>
            <Copy className="size-4" aria-hidden /> Copy link
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="add-h">
        <h2 id="add-h" className="font-semibold">Add a friend</h2>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addFriend(input);
              setMessage(r.ok ? { text: `Added ${r.cityName}.`, ok: true } : { text: r.error, ok: false });
              if (r.ok) setInput("");
            });
          }}
        >
          <label className="sr-only" htmlFor="friend-code">Friend&apos;s city code</label>
          <input
            id="friend-code"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoComplete="off"
            className="input w-40 font-mono text-lg tracking-[0.2em]"
          />
          <button type="submit" className="btn-primary" disabled={pending || input.length !== 6}>
            <UserPlus className="size-4" aria-hidden /> Add
          </button>
        </form>
        {message && <p role="status" className={`mt-2 text-sm ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</p>}
      </section>

      <section className="card p-0 sm:p-0" aria-labelledby="list-h">
        <h2 id="list-h" className="px-4 pt-4 font-semibold sm:px-5">Your friends</h2>
        {friends.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted sm:px-5">No friends yet. Share your code or an invite link.</p>
        ) : (
          <ul className="divide-y divide-line">
            {friends.map((f) => (
              <li key={f.friend_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent-text">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.city_name}</p>
                  <p className="truncate text-xs text-muted">
                    {f.display_name ? `${f.display_name} · ` : ""}
                    <Users className="inline size-3" aria-hidden /> {formatCoins(f.population)} people · {f.buildings} buildings · {f.city_size}×{f.city_size}
                  </p>
                </div>
                <Link href={`/visit/${f.friend_id}`} className="btn-primary min-h-10 px-3 py-1 text-sm">
                  <Eye className="size-4" aria-hidden /> Visit
                </Link>
                <button
                  type="button"
                  aria-label={`Remove ${f.city_name}`}
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirm({ title: `Remove ${f.city_name}?`, message: "You can add it again with its code.", confirmLabel: "Remove", tone: "danger" });
                    if (!ok) return;
                    start(async () => {
                      const r = await removeFriend(f.friend_id);
                      if (!r.ok) setMessage({ text: r.error, ok: false });
                    });
                  }}
                  className="flex size-10 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink"
                >
                  <UserMinus className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
