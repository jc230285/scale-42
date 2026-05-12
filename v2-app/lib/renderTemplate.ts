import fs from "fs";
import path from "path";

export type SectionOverride = { key: string; value_en: string | null };

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
export function renderTemplate(slug: string, overrides: SectionOverride[], mode: "cms" | "preview" | "live") {
  let html = load(slug);

  const map = new Map(overrides.map((o) => [o.key, o.value_en ?? ""]));

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
