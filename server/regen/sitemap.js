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
  const topPages = ['', 'datacenters/', 'news/', 'solutions/', 'sustainability/', 'partners/', 'about-us/', 'privacy/'];
  for (const p of topPages) urls.push({ loc: `${BASE}/${p}` });
  // Per-site detail and per-news article pages intentionally omitted (kept noindex) until further notice.

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf-8');
  console.log('sitemap.xml: wrote', urls.length, 'URLs');
}

module.exports = { run, files: ['content/sites.json', 'content/news.json', 'sitemap.xml'] };
if (require.main === module) run();
