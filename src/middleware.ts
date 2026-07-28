import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * PRD §4 / Epic E5: /sell, /dashboard, /orders, /admin require a session.
 *
 * HARD RULE (Epic E5 AC1): middleware protection is NOT sufficient on its
 * own for /admin — non-admins must get 404, not a redirect. That role check
 * requires an admin claim on profiles, which does not exist yet (§15.5 B22:
 * "mechanism decided in Phase 3's first migration"). Until that migration
 * lands, /admin only enforces "is signed in" here, same as the other
 * protected prefixes; the real admin-role check is re-verified in every
 * admin server action once it exists (§11.2: "every admin action re-verifies
 * admin role from the database").
 */
const PROTECTED_PREFIXES = ["/sell", "/dashboard", "/orders", "/admin"];

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
