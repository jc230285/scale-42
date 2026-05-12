import { createClient } from "@/lib/supabase-server";
import { renderTemplate } from "@/lib/renderTemplate";

// Returns the rendered home HTML as text/plain so we can grep it from curl
// to diagnose what the server is actually producing. Public — no PII here,
// just the same HTML logged-in CMS users see.
export async function GET() {
  const sb = createClient();
  const [{ data: overrides }, { data: nav }, { data: sites }, { data: news }, { data: developers }] = await Promise.all([
    sb.from("S42_sections").select("key,value_en").eq("page", "home"),
    sb.from("S42_nav").select("id,label,href,is_cta,order_idx").eq("published", true).order("order_idx"),
    sb.from("S42_sites").select("id,name,country,status,lat,lng,developers,target_mw,initial_mw,max_capacity_mw").eq("published", true).order("order_idx"),
    sb.from("S42_news").select("id,slug,title_en,date_en,image,excerpt_en,alt").eq("published", true).order("order_idx").limit(4),
    sb.from("S42_developers").select("slug,name,color").eq("published", true),
  ]);

  const html = renderTemplate("home", {
    overrides: overrides ?? [],
    nav: nav ?? [],
    sites: sites ?? [],
    news: news ?? [],
    developers: developers ?? [],
  }, "cms");

  return new Response(html, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
