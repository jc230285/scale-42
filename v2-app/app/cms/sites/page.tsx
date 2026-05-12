import { createClient } from "@/lib/supabase-server";
import SitesTableClient from "./SitesTableClient";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const sb = createClient();
  const { data: sites, error } = await sb
    .from("S42_sites")
    .select("*")
    .order("order_idx", { ascending: true });

  return (
    <div className="container py-8">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="font-display text-3xl text-ink">Sites</h1>
        <p className="text-sm text-muted">{sites?.length ?? 0} rows</p>
      </div>
      <p className="text-ink2 mb-6">Edit any cell inline. Toggle publish / featured per row. Sort by clicking a column header.</p>
      {error ? <div className="text-red-600">Error: {error.message}</div> : <SitesTableClient initial={sites ?? []} />}
    </div>
  );
}
