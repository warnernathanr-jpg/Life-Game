import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user and a Supabase client acting as them; otherwise redirect to sign-in. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? "" };
}
