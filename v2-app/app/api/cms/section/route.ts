import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.page || !body.key) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Use service role for the write so RLS doesn't silently drop edits
  // (the user is already authenticated above; allowlist gate is enforced
  // by the auth.users trigger).
  const svc = createServiceClient();
  const { error } = await svc
    .from("S42_sections")
    .upsert(
      { page: body.page, key: body.key, value_en: body.value ?? "" },
      { onConflict: "page,key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
