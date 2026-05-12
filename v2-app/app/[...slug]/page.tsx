import { createClient } from "@/lib/supabase-server";
import { getMode } from "@/lib/mode";
import { renderTemplate } from "@/lib/renderTemplate";
import { redirect, notFound } from "next/navigation";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const SLUG_MAP: Record<string, string> = {
  "about-us": "about-us",
  "datacenters": "datacenters",
  "solutions": "solutions",
  "sustainability": "sustainability",
  "partners": "partners",
  "contact": "contact",
  "news": "news",
  "giga-42": "giga-42",
  "team": "team",
  "brand": "brand",
  "privacy": "privacy",
  "capabilities": "capabilities",
};

function templateExists(slug: string) {
  return fs.existsSync(path.join(process.cwd(), "lib", `_${slug}.html`));
}

export default async function CatchAll({ params }: { params: { slug: string[] } }) {
  const mode = getMode();
  const sb = createClient();

  if (mode !== "live") {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect(`/login?next=/${params.slug.join("/")}`);
  }

  // Resolve to a template slug. Allow /datacenters and /datacenters/ to both
  // map to lib/_datacenters.html. Nested paths (/news/<slug>) aren't templated
  // here yet — those will be dynamic detail pages later.
  const first = params.slug[0];
  const mapped = SLUG_MAP[first];
  if (!mapped || params.slug.length > 1 || !templateExists(mapped)) notFound();

  const [{ data: overrides }, { data: nav }] = await Promise.all([
    sb.from("S42_sections").select("key,value_en").eq("page", mapped),
    sb.from("S42_nav").select("id,label,href,is_cta,order_idx").eq("published", true).order("order_idx"),
  ]);

  const html = renderTemplate(mapped, overrides ?? [], mode, nav ?? []);
  return <div dangerouslySetInnerHTML={{ __html: extractBody(html) }} />;
}

function extractBody(full: string) {
  const m = full.match(/<body[^>]*>([\s\S]*)<\/body>/);
  const headMatch = full.match(/<head[^>]*>([\s\S]*?)<\/head>/);
  const headStyles =
    headMatch
      ? Array.from(headMatch[1].matchAll(/<link[^>]+rel="stylesheet"[^>]*>|<style[^>]*>[\s\S]*?<\/style>/g))
          .map((x) => x[0])
          .join("\n")
      : "";
  return headStyles + (m ? m[1] : full);
}
