import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";
import { supabaseKey, supabaseUrl } from "./env";

/**
 * Supabase client acting as the signed-in user (RLS applies).
 * Create one per request, in Server Components, Server Actions and Route Handlers.
 * The app never uses the service-role key.
 */
export async function createClient() {
  // The auth client reads the clock (token expiry), so it must only run at request time.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
