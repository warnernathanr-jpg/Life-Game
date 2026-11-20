import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { originFromHeaders } from "@/lib/origin";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const GAME_PATHS = ["/city", "/play", "/tasks", "/goals", "/settings", "/focus", "/stats", "/today", "/coins"];

/**
 * Refreshes the Supabase session cookie on every request, keeps signed-out
 * visitors out of the game pages and sends signed-in visitors past the landing
 * and sign-in pages. Pages and actions still check the user themselves.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Must run before anything else so a refreshed token is written to the response.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && GAME_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return redirectWithCookies(request, response, "/login");
  }
  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    return redirectWithCookies(request, response, "/city");
  }
  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, originFromHeaders(request.headers)));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
