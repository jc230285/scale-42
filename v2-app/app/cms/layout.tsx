import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

const NAV = [
  { href: "/", label: "Site" },
  { href: "/cms/nav", label: "Menu" },
  { href: "/cms/sites", label: "Sites" },
  { href: "/cms/news", label: "News" },
  { href: "/cms/people", label: "People" },
  { href: "/cms/developers", label: "Partners" },
  { href: "/cms/journey", label: "Journey" },
  { href: "/cms/sections", label: "Sections" },
];

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/cms/sites");

  return (
    <div className="min-h-screen bg-bgalt">
      <header className="bg-ink text-white sticky top-0 z-50">
        <div className="container py-3 flex items-center gap-6">
          <Link href="/" className="font-display font-semibold">Scale42 CMS</Link>
          <nav className="flex gap-4 text-sm">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className="opacity-80 hover:opacity-100">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto text-xs opacity-70">{user.email}</div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
