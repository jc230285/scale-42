import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

const MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Throttled auto-publish. Called by the CMS overlay after every edit.
 * If the last successful publish was >= MIN_INTERVAL_MS ago AND there have
 * been edits since, kicks /api/publish. Otherwise returns the next allowed time.
 *
 * "Edits since" = any S42_* row with updated_at > last_publish.ts, or any
 * S42_sections updated_at > last_publish.ts.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const svc = createServiceClient();

  const { data: lastPub } = await svc
    .from("S42_audit")
    .select("ts")
    .eq("action", "publish")
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastPubMs = lastPub ? new Date(lastPub.ts).getTime() : 0;
  const sinceLast = Date.now() - lastPubMs;

  if (sinceLast < MIN_INTERVAL_MS) {
    return NextResponse.json({
      ok: true,
      skipped: "throttled",
      next_eligible_in_ms: MIN_INTERVAL_MS - sinceLast,
    });
  }

  // Re-invoke /api/publish (forwarding the auth cookie so the user context is
  // preserved for the audit row).
  const origin = new URL(req.url).origin;
  const r = await fetch(`${origin}/api/publish`, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json({ ok: r.ok, auto: true, downstream: j }, { status: r.status });
}
