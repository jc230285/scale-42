import { createClient } from "@/lib/supabase-server";
import RowsEditor, { type Col } from "@/components/edit/RowsEditor";

export const dynamic = "force-dynamic";

const COLS: Col[] = [
  { key: "name", label: "Name", w: "200px" },
  { key: "role", label: "Role", w: "200px" },
  { key: "slug", label: "Slug", w: "140px" },
  { key: "photo", label: "Photo", w: "200px" },
  { key: "linkedin", label: "LinkedIn", w: "200px" },
  { key: "bio", label: "Bio", type: "longtext", w: "220px" },
  { key: "published", label: "Published", type: "bool", w: "90px" },
];

export default async function PeoplePage() {
  const sb = createClient();
  const { data } = await sb.from("S42_people").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">People</h1>
      <RowsEditor
        table="S42_people"
        initial={data ?? []}
        cols={COLS}
        filterKeys={["name", "role", "slug"]}
        defaults={{ name: "New person", slug: `person-${Date.now()}`, published: false }}
      />
    </div>
  );
}
