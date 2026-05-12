import fs from "fs";
import path from "path";

export type SectionOverride = { key: string; value_en: string | null };
export type NavItem = { id: string; label: string; href: string; is_cta?: boolean; order_idx?: number };

const TEMPLATES: Record<string, string | undefined> = {};

function load(slug: string) {
  if (TEMPLATES[slug]) return TEMPLATES[slug]!;
  const p = path.join(process.cwd(), "lib", `_${slug}.html`);
  TEMPLATES[slug] = fs.readFileSync(p, "utf8");
  return TEMPLATES[slug]!;
}

/**
 * Render a live-site template by:
 *  - replacing <!--cms:KEY-->...<!--/cms:KEY--> regions with a span that carries
 *    edit metadata (data-cms-key, data-cms-page). Inner text is the override
 *    from S42_sections if present, otherwise the original baked-in text.
 *  - stripping the brand <script src="lang.js"> (handled differently in v2)
 *  - rewriting "styles.css" path to "/styles.css" so the public-served copy
 *    is used regardless of which directory the page lives in.
 */
export function renderTemplate(
  slug: string,
  overrides: SectionOverride[],
  mode: "cms" | "preview" | "live",
  nav: NavItem[] = [],
) {
  let html = load(slug);

  const map = new Map(overrides.map((o) => [o.key, o.value_en ?? ""]));

  // Replace the entire nav marker with dynamically built anchors from S42_nav.
  if (nav.length) {
    const navHtml = nav
      .sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0))
      .map((n) => {
        const cls = n.is_cta ? "btn btn-sm" : "";
        const active =
          (slug === "home" && n.href === "/") ||
          (slug !== "home" && n.href.startsWith(`/${slug}`))
            ? " active"
            : "";
        if (mode === "cms") {
          // Make each label inline-editable; URL is edited under /cms/nav.
          return `<a href="${n.href}" class="${cls}${active}"><span class="s42-edit" data-cms-table="S42_nav" data-cms-id="${n.id}" data-cms-field="label" contenteditable="true">${n.label}</span></a>`;
        }
        return `<a href="${n.href}" class="${cls}${active}">${n.label}</a>`;
      })
      .join("\n      ");
    html = html.replace(
      /<!--cms:nav-->[\s\S]*?<!--\/cms:nav-->/,
      `<a class="brand" href="/"><img src="/assets/logo-wordmark-white.svg" alt="Scale42" class="brand-logo" /></a>
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded', this.nextElementSibling.classList.toggle('open'));"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    <nav class="nav-links" data-s42-nav-root>
      ${navHtml}
    </nav>`,
    );
  }

  // Replace each marker pair with a wrapper span carrying edit metadata.
  html = html.replace(
    /<!--cms:([a-z0-9_-]+)-->([\s\S]*?)<!--\/cms:\1-->/g,
    (_match, key: string, inner: string) => {
      const override = map.get(key);
      const value = override != null && override !== "" ? override : inner;
      const editable = mode === "cms" ? ` contenteditable="true"` : "";
      return `<span class="s42-edit" data-cms-page="${slug}" data-cms-key="${key}"${editable}>${value}</span>`;
    },
  );

  // In CMS mode, auto-wrap every visible text element (h1-h4, p, li, dt, dd,
  // a inside .btn / .card) with an inline editor span so the user can edit
  // anywhere — not just the explicitly marked regions. Stable position-based
  // keys (auto_<tag>_<index>) let edits survive page reloads.
  if (mode === "cms") {
    const counters: Record<string, number> = {};
    const TAGS = ["h1", "h2", "h3", "h4", "p", "li", "dt", "dd"];
    const re = new RegExp(`<(${TAGS.join("|")})\\b([^>]*)>([\\s\\S]*?)</\\1>`, "g");
    html = html.replace(re, (full, tag: string, attrs: string, inner: string) => {
      // Skip if already wrapped (carries s42-edit) or contains complex nested
      // HTML (links, spans we want individually editable).
      if (inner.includes("s42-edit")) return full;
      // Skip empty/whitespace-only
      if (!inner.trim()) return full;
      // Skip elements that are pure containers (e.g. <p><a><img></a></p>)
      if (/^[\s]*<(a|img|svg|picture|button|video)\b/i.test(inner.trim()) && !inner.replace(/<[^>]+>/g, "").trim()) {
        return full;
      }
      counters[tag] = (counters[tag] || 0) + 1;
      const key = `auto_${tag}_${counters[tag]}`;
      const override = map.get(key);
      const value = override != null && override !== "" ? override : inner;
      return `<${tag}${attrs}><span class="s42-edit" data-cms-page="${slug}" data-cms-key="${key}" contenteditable="true">${value}</span></${tag}>`;
    });
  }

  // Ensure absolute asset paths so nested routes still find /styles.css, /assets/*
  html = html.replace(/href="styles\.css"/g, 'href="/styles.css"');
  html = html.replace(/src="assets\//g, 'src="/assets/');
  html = html.replace(/href="assets\//g, 'href="/assets/');
  html = html.replace(/srcset="assets\//g, 'srcset="/assets/');

  // Strip lang.js (NO/EN switcher) — v2 is EN only for now
  html = html.replace(/<script src="lang\.js"[^>]*><\/script>/g, "");

  // Insert overlay + supabase bridge in CMS mode, right before </body>
  if (mode === "cms") {
    html = html.replace(
      "</body>",
      `<link rel="stylesheet" href="/cms-overlay.css"/><script src="/cms-overlay.js" defer></script><div id="s42-cms-toolbar"></div></body>`,
    );
  } else if (mode === "preview") {
    html = html.replace(
      "</body>",
      `<div style="position:fixed;bottom:12px;right:12px;background:#1c2e3f;color:#fff;padding:6px 12px;border-radius:6px;font:600 11px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;z-index:9999">Preview · draft data</div></body>`,
    );
  }

  return html;
}
