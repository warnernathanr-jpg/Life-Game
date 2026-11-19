"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const [timezone, setTimezone] = useState("UTC");
  useEffect(() => {
    // Read the browser's time zone after mount (not during render) so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  return (
    <form action={action} className="space-y-4" noValidate>
      {mode === "signup" && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Your name (optional)</span>
          <input name="name" defaultValue={state.name} autoComplete="given-name" maxLength={60} className="input mt-1" />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input name="email" type="email" required defaultValue={state.email} autoComplete="email" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="input mt-1"
        />
        {mode === "signup" && <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>}
      </label>
      <input type="hidden" name="timezone" value={timezone} />

      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.info && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.info}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "One moment…" : mode === "login" ? "Sign in" : "Create my city"}
      </button>
      <p className="text-center text-sm text-slate-600">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="link">Create an account</Link></>
        ) : (
          <>Already playing? <Link href="/login" className="link">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
