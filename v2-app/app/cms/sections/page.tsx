import { createClient } from "@/lib/supabase-server";
import SectionsEditor from "./SectionsEditor";

export const dynamic = "force-dynamic";

export default async function SectionsPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_sections").select("*").order("page").order("key");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-3">Page sections (incl. formulas)</h1>
      <p className="text-muted text-sm mb-5">
        Any value containing <code className="bg-bgalt px-1 rounded">{`{{token}}`}</code> is treated
        as a formula. Supported tokens: <code className="bg-bgalt px-1 rounded">sum_target_mw</code>,
        <code className="bg-bgalt px-1 rounded mx-1">sum_initial_mw</code>,
        <code className="bg-bgalt px-1 rounded">sum_max_capacity_mw</code>,
        <code className="bg-bgalt px-1 rounded mx-1">min_target_mw</code>,
        <code className="bg-bgalt px-1 rounded">max_target_mw</code>,
        <code className="bg-bgalt px-1 rounded mx-1">count_sites</code>,
        <code className="bg-bgalt px-1 rounded">count_active_sites</code>,
        <code className="bg-bgalt px-1 rounded mx-1">count_countries</code>,
        <code className="bg-bgalt px-1 rounded">count_news</code>,
        <code className="bg-bgalt px-1 rounded mx-1">count_people</code>.
      </p>
      <SectionsEditor initial={data ?? []} />
    </div>
  );
}
