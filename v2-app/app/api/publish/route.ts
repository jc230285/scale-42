import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

/**
 * Publish: snapshot Supabase "published" rows to content/*.json on the master
 * branch via GitHub Contents API. The static prod app (scale-42-prod) is wired
 * to redeploy from master, so it picks up the new JSON automatically. We also
 * trigger an explicit Coolify redeploy as a safety net.
 *
 * Required env (set in Coolify CMS app only):
 *   GITHUB_TOKEN          PAT with repo:contents:write on jc230285/scale-42
 *   GITHUB_REPO           "jc230285/scale-42"  (default if absent)
 *   GITHUB_BRANCH         "master"             (default)
 *   COOLIFY_DEPLOY_TOKEN  Coolify bearer token
 *   COOLIFY_PROD_UUID     "fqv5l7alzciqnfxqtzmtpyvj"
 */

const REPO = process.env.GITHUB_REPO || "jc230285/scale-42";
const BRANCH = process.env.GITHUB_BRANCH || "master";

async function gh(method: string, path: string, body?: any) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GitHub ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function putFile(filePath: string, content: string, message: string) {
  // Need the current SHA if the file exists, else create
  let sha: string | undefined;
  try {
    const existing = await gh("GET", `contents/${encodeURIComponent(filePath)}?ref=${BRANCH}`);
    sha = existing?.sha;
  } catch {
    // 404 — fine, this is a new file
  }
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
    sha,
  };
  return gh("PUT", `contents/${encodeURIComponent(filePath)}`, body);
}

function stripDbCols<T extends Record<string, any>>(r: T): T {
  const { created_at, updated_at, ...rest } = r;
  return rest as T;
}

export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "Server not configured: GITHUB_TOKEN missing in CMS env." },
      { status: 501 },
    );
  }

  // Service-role client to bypass RLS while we snapshot every row (even drafts
  // for diagnostics, though we filter to published below).
  const svc = createServiceClient();

  // Auth check: only allowlisted editors may publish.
  const { data: allow } = await svc
    .from("S42_allowed_users")
    .select("email")
    .eq("email", user.email!.toLowerCase())
    .maybeSingle();
  const isDomain = user.email!.toLowerCase().endsWith("@scale-42.com");
  if (!allow && !isDomain) {
    return NextResponse.json({ error: "Not allowlisted" }, { status: 403 });
  }

  // Pull each table.
  const [sites, news, people, devs, journey, jmeta, sections, sitesSchema] = await Promise.all([
    svc.from("S42_sites").select("*").eq("published", true).order("order_idx"),
    svc.from("S42_news").select("*").eq("published", true).order("order_idx"),
    svc.from("S42_people").select("*").eq("published", true).order("order_idx"),
    svc.from("S42_developers").select("*").eq("published", true).order("order_idx"),
    svc.from("S42_journey").select("*").order("order_idx"),
    svc.from("S42_journey_meta").select("*").eq("id", 1).maybeSingle(),
    svc.from("S42_sections").select("*"),
    svc.from("S42_sites_schema").select("schema").eq("id", 1).maybeSingle(),
  ]);

  for (const r of [sites, news, people, devs, journey, sections] as const) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  const ts = new Date().toISOString();
  const msg = `cms: publish ${ts} by ${user.email}`;

  const files: { path: string; content: any }[] = [
    { path: "content/sites.json", content: (sites.data ?? []).map(stripDbCols) },
    { path: "content/news.json", content: (news.data ?? []).map(stripDbCols) },
    { path: "content/people.json", content: (people.data ?? []).map(stripDbCols) },
    { path: "content/developers.json", content: (devs.data ?? []).map(stripDbCols) },
    {
      path: "content/journey.json",
      content: {
        title_en: jmeta.data?.title_en ?? "Our Journey",
        lede_en: jmeta.data?.lede_en ?? "",
        items: (journey.data ?? []).map(stripDbCols),
      },
    },
    { path: "content/sections.json", content: sections.data ?? [] },
  ];
  if (sitesSchema.data?.schema) {
    files.push({ path: "content/sites_schema.json", content: sitesSchema.data.schema });
  }

  const results: { path: string; ok: boolean; error?: string }[] = [];
  for (const f of files) {
    try {
      await putFile(f.path, JSON.stringify(f.content, null, 2) + "\n", msg);
      results.push({ path: f.path, ok: true });
    } catch (e: any) {
      results.push({ path: f.path, ok: false, error: e.message });
    }
  }

  // Trigger Coolify redeploy of prod (master HEAD changed; auto-deploy should
  // also fire, but explicit poke avoids race with debouncing).
  let coolifyKick: string | null = null;
  if (process.env.COOLIFY_DEPLOY_TOKEN && process.env.COOLIFY_PROD_UUID) {
    try {
      const r = await fetch(
        `https://vps.sandstormlogic.com/api/v1/deploy?uuid=${process.env.COOLIFY_PROD_UUID}&force=true`,
        { headers: { Authorization: `Bearer ${process.env.COOLIFY_DEPLOY_TOKEN}` } },
      );
      coolifyKick = r.ok ? "queued" : `http ${r.status}`;
    } catch (e: any) {
      coolifyKick = `error: ${e.message}`;
    }
  }

  // Audit log
  await svc.from("S42_audit").insert({
    actor_email: user.email,
    table_name: "publish",
    action: "publish",
    target_id: ts,
    diff: { files: results.map((r) => r.path), coolifyKick },
  });

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    return NextResponse.json(
      { ok: false, results, coolifyKick, error: "Some files failed to write" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, results, coolifyKick, message: msg });
}
