import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

const ALLOWED = new Set([
  "S42_nav",
  "S42_sites",
  "S42_news",
  "S42_people",
  "S42_developers",
  "S42_journey",
]);

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.table || !body.id || !body.field) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!ALLOWED.has(body.table)) {
    return NextResponse.json({ error: "table_not_allowed" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from(body.table)
    .update({ [body.field]: body.value ?? null })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
