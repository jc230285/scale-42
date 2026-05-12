import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const sb = createClient();
  const { data } = await sb.from("S42_people").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">People</h1>
      <p className="text-muted mb-6">{data?.length ?? 0} people loaded. Table editor coming next.</p>
      <ul className="bg-white border border-line rounded-md divide-y divide-line">
        {(data ?? []).map(p => (
          <li key={p.id} className="px-4 py-3 flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${p.published ? "bg-green-500" : "bg-warm"}`} />
            <span className="font-semibold text-ink flex-1">{p.name}</span>
            <span className="text-xs text-muted">{p.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
