import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const mode = (process.env.NEXT_PUBLIC_MODE || "preview").toLowerCase();
  const requiresAuth = mode !== "live";

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items: { name: string; value: string; options: CookieOptions }[]) {
          items.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options as CookieOptions);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public endpoints that must work even when not logged in
  const path = request.nextUrl.pathname;
  const publicPrefixes = [
    "/login",
    "/api/auth/callback",
    "/_next",
    "/favicon",
    "/assets",
  ];
  const publicExact = [
    "/styles.css",
    "/cms-overlay.js",
    "/cms-overlay.css",
    "/robots.txt",
    "/site.webmanifest",
  ];
  const isPublic =
    publicPrefixes.some((p) => path.startsWith(p)) ||
    publicExact.includes(path) ||
    /\.(?:css|js|svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$/i.test(path);

  if (requiresAuth && !user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"],
};
