import { createClient } from "@/lib/supabase-server";
import { getMode } from "@/lib/mode";
import { renderTemplate } from "@/lib/renderTemplate";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Home() {
  const mode = getMode();
  const sb = createClient();

  if (mode !== "live") {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect("/login?next=/");
  }

  const [{ data: overrides }, { data: nav }, { data: sites }, { data: news }, { data: developers }] = await Promise.all([
    sb.from("S42_sections").select("key,value_en").eq("page", "home"),
    sb.from("S42_nav").select("id,label,href,is_cta,order_idx").eq("published", true).order("order_idx"),
    sb.from("S42_sites").select("id,name,country,status,lat,lng,developers").eq("published", true).order("order_idx"),
    sb.from("S42_news").select("id,slug,title_en,date_en,image,excerpt_en,alt").eq("published", true).order("order_idx").limit(4),
    sb.from("S42_developers").select("slug,name,color").eq("published", true),
  ]);

  const html = renderTemplate("home", {
    overrides: overrides ?? [],
    nav: nav ?? [],
    sites: sites ?? [],
    news: news ?? [],
    developers: developers ?? [],
  }, mode);

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
  // Re-extract any <script> tags from the original body so the leaflet map etc.
  // still runs in our injected fragment.
  return headStyles + (m ? m[1] : full);
}
