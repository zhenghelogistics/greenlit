import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * §7. Nothing is reachable without a session.
 *
 * Gating here rather than in each page means a route added later is protected
 * by default. The alternative — remembering to check in every new screen — is
 * the one that eventually ships a screen nobody remembered to check.
 *
 * This establishes only that somebody is signed in. Whether that person is
 * staff, and what they may do, is the directory's answer and is settled
 * server-side on every command.
 */
const PUBLIC = ["/sign-in", "/sign-up", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without keys nobody can sign in, so gating would lock everyone out of a
  // deployment that is merely misconfigured. /api/health says what is wrong.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims, not getSession: the signature is verified against the
  // project's public key rather than the cookie being taken at its word.
  //
  // It is also not getUser, which asks Supabase the same question over the
  // network — 125ms on every request that reaches this file, against 1ms to
  // check an ES256 signature locally. The security property is identical:
  // a tampered token fails verification either way.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    // An API call gets an answer it can act on; a page gets the door.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
