import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { originFromHeaders } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for confirmation emails: `token_hash` + `type` (custom templates,
 * any browser) or `code` (Supabase's default template, same browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = originFromHeaders(request.headers);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  return NextResponse.redirect(new URL(ok ? "/city" : "/login?error=link_invalid", origin));
}
