import { createClient } from "@/lib/supabase-server";
import RowsEditor, { type Col } from "@/components/edit/RowsEditor";

export const dynamic = "force-dynamic";

const COLS: Col[] = [
  { key: "label", label: "Label", w: "200px" },
  { key: "href", label: "URL", w: "260px" },
  { key: "is_cta", label: "CTA style", type: "bool", w: "100px" },
  { key: "published", label: "Visible", type: "bool", w: "90px" },
];

export default async function NavPage() {
  const sb = createClient();
  const { data } = await sb.from("S42_nav").select("*").order("order_idx");
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl text-ink mb-4">Menu</h1>
      <p className="text-muted text-sm mb-4">
        Top navigation across every page. Drag order with ▲▼. CTA style turns the
        link into a button (used for Contact).
      </p>
      <RowsEditor
        table="S42_nav"
        initial={data ?? []}
        cols={COLS}
        filterKeys={["label", "href"]}
        defaults={{ label: "New link", href: "/", published: true, is_cta: false }}
      />
    </div>
  );
}
