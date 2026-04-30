const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'https://www.scale-42.com';

function siteSlug(s) {
  return (s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
}

function run() {
  const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sites.json'), 'utf-8')).sites;
  const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'news.json'), 'utf-8')).posts;
  const today = new Date().toISOString().slice(0, 10);

  const urls = [];
  // Top-level pages
  const topPages = ['', 'datacenters/', 'news/', 'capabilities/', 'team/'];
  for (const p of topPages) {
    urls.push({ loc: `${BASE}/${p}`, alt: `${BASE}/no/${p}` });
  }
  // Per-site detail
  for (const s of sites.filter(x => x.published)) {
    const slug = siteSlug(s);
    urls.push({ loc: `${BASE}/datacenters/${slug}/`, alt: `${BASE}/no/datacenters/${slug}/` });
  }
  // Per-news post
  for (const n of news.filter(x => x.published)) {
    urls.push({ loc: `${BASE}/news/${n.slug}/`, alt: `${BASE}/no/news/${n.slug}/` });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${u.loc}"/>
    <xhtml:link rel="alternate" hreflang="nb" href="${u.alt}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${u.loc}"/>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf-8');
  console.log('sitemap.xml: wrote', urls.length, 'URLs');
}

module.exports = { run, files: ['content/sites.json', 'content/news.json', 'sitemap.xml'] };
if (require.main === module) run();
