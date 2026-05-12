import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

/**
 * Publish: snapshot Supabase "published" state to content/*.json on master,
 * commit, push, and trigger Coolify redeploy of scale-42-prod.
 *
 * Stub for now — wired up properly in Task #11. Returns a 501 with instructions.
 */
export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Check the user is allowlisted (RLS would block anyway, but explicit is better)
  const svc = createServiceClient();
  const { data: row } = await svc.from("S42_allowed_users").select("email").eq("email", user.email).maybeSingle();
  const isDomain = user.email?.toLowerCase().endsWith("@scale-42.com");
  if (!row && !isDomain) {
    return NextResponse.json({ error: "Not allowlisted" }, { status: 403 });
  }

  return NextResponse.json({
    error: "Publish flow wired up in Task #11. Manual publish for now: git pull on master, run scripts/migrate-to-supabase.js in reverse (export Supabase → JSON), commit, push.",
    todo: "Task #11",
  }, { status: 501 });
}
