import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.page || !body.key) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const { page, key, value } = body;

  const { error } = await sb
    .from("S42_sections")
    .upsert({ page, key, value_en: value ?? "" }, { onConflict: "page,key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
