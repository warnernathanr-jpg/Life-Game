export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

/** Publishable (anon) key. Safe for the browser; RLS protects the data. */
export function supabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return key;
}
