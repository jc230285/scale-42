import { createClient } from "@/lib/supabase-server";
import RowsEditor, { type Col } from "@/components/edit/RowsEditor";

export const dynamic = "force-dynamic";

const COLS: Col[] = [
  { key: "year", label: "Year", w: "90px" },
  { key: "headline_en", label: "Headline", w: "260px" },
  { key: "badge_en", label: "Badge", w: "120px" },
  { key: "image", label: "Image", w: "200px" },
  { key: "body_en", label: "Body", type: "longtext", w: "300px" },
];

export default async function JourneyPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_journey").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Journey</h1>
      <RowsEditor
        table="S42_journey"
        initial={data ?? []}
        cols={COLS}
        filterKeys={["year", "headline_en"]}
        defaults={{ year: "", headline_en: "New milestone" }}
      />
    </div>
  );
}
