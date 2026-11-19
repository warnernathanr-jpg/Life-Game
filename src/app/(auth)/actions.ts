"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { originFromHeaders } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string; email?: string; name?: string };

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  const typedEmail = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: typedEmail };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first. Check your inbox for the link.", email: typedEmail };
    }
    if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again.", email: typedEmail };
    return { error: "Wrong email or password.", email: typedEmail };
  }
  redirect("/city");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      name: z.string().trim().max(60, "Keep your name under 60 characters."),
      email,
      password,
      timezone: z.string().max(64).catch("UTC"),
    })
    .safeParse({
      name: formData.get("name") ?? "",
      email: formData.get("email") ?? "",
      password: formData.get("password") ?? "",
      timezone: formData.get("timezone") ?? "UTC",
    });
  const typed = { email: String(formData.get("email") ?? ""), name: String(formData.get("name") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, ...typed };

  const supabase = await createClient();
  const origin = originFromHeaders(await headers());
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      // Read by the database's sign-up trigger to create the profile.
      data: { display_name: parsed.data.name, timezone: parsed.data.timezone },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "Choose a stronger password.", ...typed };
    if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again.", ...typed };
    return { error: "Couldn't create the account. Please try again.", ...typed };
  }
  if (!data.session) {
    // Email confirmation is on (hosted projects): the user finishes from the email link.
    return { info: `Check ${parsed.data.email} for a link to confirm your account.`, ...typed };
  }
  redirect("/city");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
