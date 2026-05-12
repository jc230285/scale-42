import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Allowlist trigger rejects with S42_ACCESS_DENIED — bubble to a friendly page
      const dest = new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin);
      return NextResponse.redirect(dest);
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
