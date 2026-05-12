import fs from "fs";
import path from "path";
import { evalFormulas } from "./formulas";

export type SectionOverride = { key: string; value_en: string | null };
export type NavItem = { id: string; label: string; href: string; is_cta?: boolean; order_idx?: number };
export type Site = { name: string; country?: string | null; status?: string | null; lat?: number | null; lng?: number | null; developers?: any[] | null };
export type NewsRow = { slug: string; title_en?: string; date_en?: string; image?: string; excerpt_en?: string; alt?: string };
export type Developer = { slug: string; name: string; color?: string };

export type RenderData = {
  overrides?: SectionOverride[];
  nav?: NavItem[];
  sites?: Site[];
  news?: NewsRow[];
  developers?: Developer[];
};

const TEMPLATES: Record<string, string | undefined> = {};

function load(slug: string) {
  if (TEMPLATES[slug]) return TEMPLATES[slug]!;
  const p = path.join(process.cwd(), "lib", `_${slug}.html`);
  TEMPLATES[slug] = fs.readFileSync(p, "utf8");
  return TEMPLATES[slug]!;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderTemplate(
  slug: string,
  data: RenderData,
  mode: "cms" | "preview" | "live",
) {
  let html = load(slug);
  const overrides = data.overrides ?? [];
  const nav = data.nav ?? [];
  const sites = data.sites ?? [];
  const news = data.news ?? [];
  const developers = data.developers ?? [];
  const map = new Map(overrides.map((o) => [o.key, o.value_en ?? ""]));

  // --- Nav: inject dynamic anchors from S42_nav ---
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
          return `<a href="${n.href}" class="${cls}${active}"><span class="s42-edit" data-cms-table="S42_nav" data-cms-id="${n.id}" data-cms-field="label" contenteditable="true">${escapeHtml(n.label)}</span></a>`;
        }
        return `<a href="${n.href}" class="${cls}${active}">${escapeHtml(n.label)}</a>`;
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

  // --- News cards (home page only) ---
  if (news.length && html.includes("<!--cms:home_news-->")) {
    const cards = news
      .slice(0, 4)
      .map((p) => {
        const img = p.image ? `<div class="post-img"><img src="${p.image}" alt="${escapeHtml(p.alt ?? "")}" loading="lazy"/></div>` : "";
        const title = mode === "cms"
          ? `<h3><span class="s42-edit" data-cms-table="S42_news" data-cms-id="${(p as any).id}" data-cms-field="title_en" contenteditable="true">${escapeHtml(p.title_en ?? "")}</span></h3>`
          : `<h3>${escapeHtml(p.title_en ?? "")}</h3>`;
        const excerpt = mode === "cms"
          ? `<p><span class="s42-edit" data-cms-table="S42_news" data-cms-id="${(p as any).id}" data-cms-field="excerpt_en" contenteditable="true">${escapeHtml(p.excerpt_en ?? "")}</span></p>`
          : `<p>${escapeHtml(p.excerpt_en ?? "")}</p>`;
        return `<article class="post">${img}<p class="post-date">${escapeHtml(p.date_en ?? "")}</p>${title}${excerpt}<a href="/news/${p.slug}/">Read &rarr;</a></article>`;
      })
      .join("\n      ");
    html = html.replace(/<!--cms:home_news-->[\s\S]*?<!--\/cms:home_news-->/, cards);
  }

  // --- Sites map array (home page only, inside a JS region) ---
  if (sites.length && html.includes("/*cms:sites_array*/")) {
    const arr = sites.map((s) => ({
      name: s.name,
      country: s.country,
      status: s.status,
      lat: s.lat,
      lng: s.lng,
      developers: Array.isArray(s.developers) ? s.developers : [],
    }));
    html = html.replace(
      /\/\*cms:sites_array\*\/[\s\S]*?\/\*\/cms:sites_array\*\//,
      JSON.stringify(arr),
    );
  }
  if (developers.length && html.includes("/*cms:developers_map*/")) {
    const m: Record<string, { name: string; color: string }> = {};
    developers.forEach((d) => (m[d.slug] = { name: d.name, color: d.color || "#1c2e3f" }));
    html = html.replace(
      /\/\*cms:developers_map\*\/[\s\S]*?\/\*\/cms:developers_map\*\//,
      JSON.stringify(m),
    );
  }

  // --- Generic <!--cms:KEY-->...<!--/cms:KEY--> markers ---
  html = html.replace(
    /<!--cms:([a-z0-9_-]+)-->([\s\S]*?)<!--\/cms:\1-->/g,
    (_match, key: string, inner: string) => {
      const override = map.get(key);
      const value = override != null && override !== "" ? override : inner;
      const hasFormula = /\{\{[a-z0-9_]+\}\}/.test(value);
      // Formula-bearing fields are not inline-editable in CMS mode — the user
      // edits them in /cms/sections so the formula text survives. A tooltip
      // shows the source so they know it's calculated.
      if (mode === "cms" && hasFormula) {
        return `<span class="s42-formula" data-cms-page="${slug}" data-cms-key="${key}" title="Calculated: ${value.replace(/"/g,"&quot;")} — edit in /cms/sections">${value}</span>`;
      }
      const editable = mode === "cms" ? ` contenteditable="true"` : "";
      return `<span class="s42-edit" data-cms-page="${slug}" data-cms-key="${key}"${editable}>${value}</span>`;
    },
  );

  // --- Auto-wrap everything else in CMS mode ---
  if (mode === "cms") {
    const counters: Record<string, number> = {};
    // Regex literal — DO NOT use new RegExp(template-literal) here, SWC's
    // minifier mishandles the embedded \b and silently breaks auto-wrap.
    const re = /<(h1|h2|h3|h4|p|li|dt|dd)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    const splitRe = /(<span class="s42-(?:edit|formula)"[\s\S]*?<\/span>)/;
    html = html.replace(re, (full, tag: string, attrs: string, inner: string) => {
      if (!inner.trim()) return full;
      // Pure-element wrappers (image-only, link-only) — leave alone
      if (/^[\s]*<(a|img|svg|picture|button|video)\b/i.test(inner.trim()) && !inner.replace(/<[^>]+>/g, "").trim()) {
        return full;
      }

      counters[tag] = (counters[tag] || 0) + 1;
      const baseKey = `auto_${tag}_${counters[tag]}`;

      // If the paragraph already contains s42-* spans, split around them so
      // the surrounding text segments are individually editable too.
      if (splitRe.test(inner)) {
        const parts = inner.split(splitRe);
        const rebuilt = parts
          .map((part, i) => {
            if (i % 2 === 1) return part; // keep existing s42 span as-is
            if (!part.trim()) return part;
            const key = `${baseKey}_p${i >> 1}`;
            const override = map.get(key);
            const val = override != null && override !== "" ? override : part;
            return `<span class="s42-edit" data-cms-page="${slug}" data-cms-key="${key}" contenteditable="true">${val}</span>`;
          })
          .join("");
        return `<${tag}${attrs}>${rebuilt}</${tag}>`;
      }

      const override = map.get(baseKey);
      const value = override != null && override !== "" ? override : inner;
      return `<${tag}${attrs}><span class="s42-edit" data-cms-page="${slug}" data-cms-key="${baseKey}" contenteditable="true">${value}</span></${tag}>`;
    });
  }

  // --- Path rewrites: serve assets and stylesheet from / ---
  html = html.replace(/href="styles\.css"/g, 'href="/styles.css"');
  html = html.replace(/src="assets\//g, 'src="/assets/');
  html = html.replace(/href="assets\//g, 'href="/assets/');
  html = html.replace(/srcset="assets\//g, 'srcset="/assets/');

  html = html.replace(/<script src="lang\.js"[^>]*><\/script>/g, "");

  // Evaluate {{token}} formulas LAST (so cms-edit values authored as
  // "{{sum_target_mw}} MW" render their computed value, including in CMS
  // mode — the user sees the live number and the underlying formula is
  // still saved in S42_sections).
  html = evalFormulas(html, { sites: sites as any, news: news as any });

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
