import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function SectionsPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_sections").select("*").order("page").order("key");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Page sections</h1>
      <table className="w-full bg-white border border-line rounded-md text-sm">
        <thead className="bg-bgalt"><tr><th className="px-3 py-2 text-left text-xs uppercase text-muted">Page</th><th className="text-left text-xs uppercase text-muted">Key</th><th className="text-left text-xs uppercase text-muted">Value</th></tr></thead>
        <tbody>
          {(data ?? []).map((s, i) => (
            <tr key={i} className="border-t border-line"><td className="px-3 py-2 text-muted">{s.page}</td><td className="px-3 py-2 font-mono text-xs">{s.key}</td><td className="px-3 py-2">{s.value_en}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
