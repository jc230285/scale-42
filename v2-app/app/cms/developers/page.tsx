import { createClient } from "@/lib/supabase-server";
import RowsEditor, { type Col } from "@/components/edit/RowsEditor";

export const dynamic = "force-dynamic";

const COLS: Col[] = [
  { key: "name", label: "Name", w: "180px" },
  { key: "slug", label: "Slug", w: "130px" },
  { key: "tagline", label: "Tagline", w: "220px" },
  { key: "logo", label: "Logo URL", w: "200px" },
  { key: "url", label: "Link", w: "180px" },
  { key: "cta", label: "CTA", w: "120px" },
  { key: "color", label: "Color", w: "100px" },
  { key: "description", label: "Description", type: "longtext", w: "260px" },
  { key: "published", label: "Published", type: "bool", w: "90px" },
];

export default async function DevelopersPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_developers").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Partners</h1>
      <RowsEditor
        table="S42_developers"
        initial={data ?? []}
        cols={COLS}
        filterKeys={["name", "slug", "tagline"]}
        defaults={{ name: "New partner", slug: `partner-${Date.now()}`, published: true }}
      />
    </div>
  );
}
