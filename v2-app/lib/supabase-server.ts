import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items: { name: string; value: string; options: CookieOptions }[]) {
          try {
            items.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions),
            );
          } catch {
            // Called from Server Components — Next.js will refresh elsewhere.
          }
        },
      },
    },
  );
}

// Service-role client (server-only, used by API routes that need to bypass RLS,
// like the publish action). NEVER import this from a Client Component.
import { createClient as createSbClient } from "@supabase/supabase-js";
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY missing");
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
