import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function publicOrigin(request: Request): string {
  const h = new Headers(request.headers);
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("localhost")) {
    return `${proto}://${host}`;
  }
  // Final fallback: explicit env. Never trust request.url here — Next.js
  // standalone reports the internal bind URL (0.0.0.0:3000) and would send
  // the user there after OAuth.
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const origin = publicOrigin(request);

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const dest = new URL(`/login?error=${encodeURIComponent(error.message)}`, origin);
      return NextResponse.redirect(dest);
    }
  }
  return NextResponse.redirect(new URL(next, origin));
}
