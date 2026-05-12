import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_developers").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Partners</h1>
      <ul className="bg-white border border-line rounded-md divide-y divide-line">
        {(data ?? []).map(p => (
          <li key={p.id} className="px-4 py-3 flex items-center gap-3">
            {p.logo ? <img src={p.logo} alt="" className="h-8" /> : <span className="text-muted">[no logo]</span>}
            <span className="font-semibold text-ink flex-1">{p.name}</span>
            <span className="text-xs text-muted">{p.tagline}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
