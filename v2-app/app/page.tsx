import { createClient } from "@/lib/supabase-server";
import { getMode } from "@/lib/mode";
import { renderTemplate } from "@/lib/renderTemplate";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const mode = getMode();
  const sb = createClient();

  // Both CMS and Preview require login; live is public.
  if (mode !== "live") {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect("/login?next=/");
  }

  const { data: overrides } = await sb
    .from("S42_sections")
    .select("key,value_en")
    .eq("page", "home");

  const html = renderTemplate("home", overrides ?? [], mode);

  return <div dangerouslySetInnerHTML={{ __html: extractBody(html) }} />;
}

/**
 * Pull the rendered <body>…</body> out — we keep Next.js's own <html><body>
 * shell from app/layout.tsx, but inject the site stylesheet for this route.
 *
 * Because the live HTML uses absolute /styles.css and /assets/* paths (after
 * renderTemplate normalises them), nothing in the body needs further fixup.
 */
function extractBody(full: string) {
  const m = full.match(/<body[^>]*>([\s\S]*)<\/body>/);
  // Hoist <link> and inline <style> tags from <head> by inlining them at the
  // top of the body — Next will render them inside our own body and the
  // browser still applies them.
  const headMatch = full.match(/<head[^>]*>([\s\S]*?)<\/head>/);
  const headStyles =
    headMatch
      ? Array.from(headMatch[1].matchAll(/<link[^>]+rel="stylesheet"[^>]*>|<style[^>]*>[\s\S]*?<\/style>/g))
          .map((x) => x[0])
          .join("\n")
      : "";
  return headStyles + (m ? m[1] : full);
}
