"use client";

// Invite links (/signup?invite=CODE): the sign-up page remembers the code on this device, and once the new player is
// signed in, the inviter's city is added to their friends (then the code is forgotten).
import { useEffect, useState } from "react";
import { addFriend } from "@/app/(game)/actions";

const KEY = "lifecity:invite";

/** On the sign-up page: remember an invite code from the link and say who invited them. */
export function InviteSaver() {
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite")?.toUpperCase();
    if (code && /^[A-Z0-9]{6}$/.test(code)) {
      try {
        localStorage.setItem(KEY, code);
      } catch {}
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvited(true);
    }
  }, []);
  if (!invited) return null;
  return <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink">A friend invited you. Once you sign up, their city is added to your friends.</p>;
}

/** In the signed-in app: add the inviter's city as a friend, once. */
export function InviteRedeemer() {
  useEffect(() => {
    let code: string | null = null;
    try {
      code = localStorage.getItem(KEY);
    } catch {}
    if (!code) return;
    void addFriend(code).then((r) => {
      // Forget the code unless the request itself failed for a passing reason.
      if (r.ok || !/try again/i.test(r.error)) {
        try {
          localStorage.removeItem(KEY);
        } catch {}
      }
    });
  }, []);
  return null;
}
