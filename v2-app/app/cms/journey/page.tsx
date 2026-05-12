import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_journey").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Journey</h1>
      <ul className="space-y-3">
        {(data ?? []).map(j => (
          <li key={j.id} className="bg-white border border-line rounded-md p-4">
            <div className="text-xs uppercase tracking-wider text-accent font-semibold">{j.year}</div>
            <div className="font-display font-semibold text-ink">{j.headline_en}</div>
            <div className="text-sm text-ink2">{j.body_en}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
