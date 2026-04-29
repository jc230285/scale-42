# Scale42 website

Marketing site for Scale42 — next-generation European digital infrastructure.

Static HTML/CSS/JS, no build step. Deploys to Coolify (Hetzner) at https://s42.sandstormlogic.com (and ultimately https://www.scale-42.com).

## Structure

- `index.html` / `no/index.html` — home page (EN + NO)
- `datacenters.html` — portfolio of sites
- `brand.html` — brand guidelines
- `404.html`
- `styles.css` — single shared stylesheet
- `lang.js` — auto-detect Norwegian visitors → `/no/`
- `assets/` — logo, team photos, news images
- `_headers` / `_redirects` — Cloudflare Pages metadata (harmless on other hosts)
- `sitemap.xml` / `robots.txt`

## Local preview

```bash
python -m http.server 8080
```

## Deploy

Auto-deploys on push to `main` via Coolify webhook.
