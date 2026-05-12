import { createClient } from "@/lib/supabase-server";
import { getMode } from "@/lib/mode";
import Link from "next/link";

export default async function Home() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const mode = getMode();

  // Quick stats from Supabase to prove the connection works
  const [sites, news, people] = await Promise.all([
    sb.from("S42_sites").select("id", { count: "exact", head: true }),
    sb.from("S42_news").select("id", { count: "exact", head: true }),
    sb.from("S42_people").select("id", { count: "exact", head: true }),
  ]);

  return (
    <main className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="container py-4 flex items-center justify-between">
          <div className="font-display font-semibold">Scale42 · <span className="text-warm uppercase tracking-wider text-xs">{mode}</span></div>
          <div className="text-sm opacity-80">{user?.email ?? "not signed in"}</div>
        </div>
      </header>

      <section className="container py-12">
        <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-3">v2 · scaffold</p>
        <h1 className="font-display text-4xl text-ink mb-3">Hello from Next.js + Supabase.</h1>
        <p className="text-ink2 mb-10 max-w-2xl">
          This is the v2 scaffold. Both <code className="bg-bgalt px-1 rounded">cms.scale-42.com</code> and <code className="bg-bgalt px-1 rounded">preview.scale-42.com</code> deploy from this codebase. The mode banner above tells you which one you’re on.
        </p>

        <div className="grid grid-cols-3 gap-6 max-w-3xl">
          <div className="bg-bgalt border border-line rounded-md p-6">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">Sites</div>
            <div className="font-display text-3xl text-ink">{sites.count ?? "—"}</div>
          </div>
          <div className="bg-bgalt border border-line rounded-md p-6">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">News posts</div>
            <div className="font-display text-3xl text-ink">{news.count ?? "—"}</div>
          </div>
          <div className="bg-bgalt border border-line rounded-md p-6">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">People</div>
            <div className="font-display text-3xl text-ink">{people.count ?? "—"}</div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/cms/sites" className="bg-ink text-white font-semibold px-5 py-3 rounded-md hover:bg-accent transition">Sites editor →</Link>
          <Link href="/cms/news" className="border border-ink text-ink font-semibold px-5 py-3 rounded-md hover:bg-bgalt transition">News →</Link>
          <Link href="/cms/people" className="border border-ink text-ink font-semibold px-5 py-3 rounded-md hover:bg-bgalt transition">People →</Link>
        </div>
      </section>
    </main>
  );
}
