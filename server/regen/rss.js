const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const SITE = 'https://www.scale-42.com';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toRfc822(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return new Date().toUTCString();
  return d.toUTCString();
}

function run() {
  const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'news.json'), 'utf-8'));
  const posts = (news.posts || []).filter(p => p.published);
  const items = posts.map(p => `    <item>
      <title>${esc(p.title_en)}</title>
      <link>${SITE}/news/${p.slug}/</link>
      <guid isPermaLink="true">${SITE}/news/${p.slug}/</guid>
      <pubDate>${toRfc822(p.date_en)}</pubDate>
      <description>${esc(p.excerpt_en)}</description>
    </item>`).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Scale42 — News</title>
    <link>${SITE}/news/</link>
    <atom:link href="${SITE}/news/rss.xml" rel="self" type="application/rss+xml" />
    <description>Updates from Scale42 — Nordic AI &amp; HPC data centre infrastructure.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  const outDir = path.join(ROOT, 'news');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'rss.xml'), rss, 'utf-8');
  console.log(`regen rss: ${posts.length} items`);
}

module.exports = { run };
if (require.main === module) run();
