import { createClient } from "@/lib/supabase-server";
import RowsEditor, { type Col } from "@/components/edit/RowsEditor";

export const dynamic = "force-dynamic";

const COLS: Col[] = [
  { key: "title_en", label: "Title", w: "260px" },
  { key: "slug", label: "Slug", w: "180px" },
  { key: "type_en", label: "Type", w: "100px" },
  { key: "date_en", label: "Date", w: "110px" },
  { key: "read_time", label: "Read", w: "70px" },
  { key: "image", label: "Image", w: "180px" },
  { key: "excerpt_en", label: "Excerpt", type: "longtext", w: "220px" },
  { key: "body_html", label: "Body HTML", type: "html", w: "200px" },
  { key: "featured", label: "Featured", type: "bool", w: "90px" },
  { key: "published", label: "Published", type: "bool", w: "90px" },
];

export default async function NewsPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_news").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">News</h1>
      <RowsEditor
        table="S42_news"
        initial={data ?? []}
        cols={COLS}
        filterKeys={["title_en", "slug", "type_en", "tags"]}
        defaults={{ title_en: "New post", slug: `post-${Date.now()}`, published: false }}
      />
    </div>
  );
}
