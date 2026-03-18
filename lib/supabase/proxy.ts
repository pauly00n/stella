import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ROUTES } from "@/lib/auth/routes";
import { serverEnv } from "@/lib/env/server";

const PUBLIC_STELLA_ROUTES = new Set<string>([
  AUTH_ROUTES.login,
  AUTH_ROUTES.signUp,
  AUTH_ROUTES.forgotPassword,
  AUTH_ROUTES.updatePassword,
  AUTH_ROUTES.error,
  "/sign-up-success",
  "/sign-up-exists",
  "/confirm",
]);

const AUTH_ENTRY_ROUTES = new Set<string>([
  AUTH_ROUTES.login,
  AUTH_ROUTES.signUp,
  AUTH_ROUTES.forgotPassword,
]);

function isStellaPath(pathname: string): boolean {
  return !pathname.startsWith("/api/");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });


  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;

  if (!isStellaPath(pathname)) {
    return supabaseResponse;
  }

  // Keep API auth behavior in the route handler itself (JSON 401), not middleware redirects.
  if (pathname === "/generate") {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_STELLA_ROUTES.has(pathname);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = AUTH_ROUTES.login;
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // If already authenticated, auth entry routes should not be revisited.
  if (user && AUTH_ENTRY_ROUTES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = AUTH_ROUTES.home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
