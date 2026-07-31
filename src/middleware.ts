import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * PRD §4: /sell, /dashboard, /orders require a session (redirect to sign-in
 * on failure). /admin is handled separately below — Epic E5 AC1 requires a
 * materially different failure mode (a 404 that discloses nothing, never a
 * sign-in redirect, which would itself disclose that a protected route
 * exists at that path).
 */
const PROTECTED_PREFIXES = ["/sell", "/dashboard", "/orders"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          // Responses that set auth cookies must not be cached by CDNs/proxies.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Refreshes the session if expired. Do not add logic between client
  // creation and this call — it breaks token refresh (Supabase SSR guidance).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PRD §10 Epic E5 AC1: "/admin is protected by a role check in
  // middleware. Non admins get 404, not 403. AC1 fails if the route's
  // existence is disclosed." A signed-out visitor and a signed-in
  // non-admin get the exact same response — never a sign-in redirect,
  // which would itself leak that /admin requires authorization. This is
  // the route-cloaking layer only; the actual security boundary is every
  // admin server action re-verifying `profiles.is_admin` from the database
  // independently (§11.2 HARD RULE — requireAdmin(), never trusting this
  // check or anything cached on the session).
  if (request.nextUrl.pathname.startsWith("/admin")) {
    let isAdmin = false;
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      isAdmin = profile?.is_admin === true;
    }

    if (!isAdmin) {
      // Rewriting to a path with no matching route makes Next's app router
      // render its own not-found boundary with a genuine 404 status — the
      // same response a request for any other nonexistent URL on this site
      // gets, so a non-admin visiting /admin/anything is indistinguishable
      // from a typo.
      const notFoundResponse = NextResponse.rewrite(new URL("/__admin_route_not_found__", request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => notFoundResponse.cookies.set(cookie.name, cookie.value));
      return notFoundResponse;
    }

    return supabaseResponse;
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
