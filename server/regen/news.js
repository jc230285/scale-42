const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'news.json');

const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function featureHtml(p, lang, assetsPrefix) {
  const t = lang === 'no' ? p.type_no : p.type_en;
  const d = lang === 'no' ? p.date_no : p.date_en;
  const title = lang === 'no' ? p.title_no : p.title_en;
  const ex = lang === 'no' ? p.excerpt_no : p.excerpt_en;
  const readMore = lang === 'no' ? 'Les artikkelen' : 'Read the article';
  const draftBadge = !p.published ? '<span style="background:#fef3e0;color:#a35c00;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-right:8px;">Draft</span>' : '';
  const meta = [t, d, p.read_time].filter(Boolean).join(' &middot; ');
  const articleStyle = !p.published ? ' style="opacity:0.9;border-left:3px solid #e8b87a;padding-left:14px;"' : '';
  return `    <article class="news-feature"${articleStyle}>
      <a class="img" href="${esc(p.slug)}/" aria-label="${esc(title)}">
        <img src="${assetsPrefix}assets/news/${esc(p.image)}" alt="${esc(p.alt || title)}" />
      </a>
      <div>
        <p class="meta">${draftBadge}${meta}</p>
        <h2><a href="${esc(p.slug)}/">${esc(title)}</a></h2>
        <p>${esc(ex)}</p>
        <a class="read-more" href="${esc(p.slug)}/">${readMore} &rarr;</a>
      </div>
    </article>`;
}

function cardHtml(p, lang, assetsPrefix) {
  const t = lang === 'no' ? p.type_no : p.type_en;
  const d = lang === 'no' ? p.date_no : p.date_en;
  const title = lang === 'no' ? p.title_no : p.title_en;
  const ex = lang === 'no' ? p.excerpt_no : p.excerpt_en;
  const readMore = lang === 'no' ? 'Les' : 'Read';
  const draftBadge = !p.published ? '<span style="background:#fef3e0;color:#a35c00;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-right:6px;">Draft</span>' : '';
  const cardStyle = !p.published ? ' style="opacity:0.9;border-left:3px solid #e8b87a;"' : '';
  return `      <a class="news-card" href="${esc(p.slug)}/"${cardStyle}>
        <div class="img"><img src="${assetsPrefix}assets/news/${esc(p.image)}" alt="${esc(p.alt || title)}" loading="lazy" /></div>
        <div class="body">
          <p class="meta">${draftBadge}<span>${esc(t)}</span><span class="dot">&bull;</span><span>${esc(d)}</span></p>
          <h3>${esc(title)}</h3>
          <p>${esc(ex)}</p>
          <span class="read-more">${readMore} &rarr;</span>
        </div>
      </a>`;
}

function buildBlock(posts, lang, assetsPrefix) {
  // INCLUDE_DRAFTS=true on the draft app shows unpublished posts (with a 'DRAFT' tag).
  const includeDrafts = process.env.INCLUDE_DRAFTS === 'true' || process.env.INCLUDE_DRAFTS === '1';
  const live = includeDrafts ? posts.slice() : posts.filter(p => p.published);
  const feature = live.find(p => p.featured && p.published) || live.find(p => p.published) || live[0];
  const cards = live.filter(p => p !== feature);
  const featureHtmlOut = feature ? featureHtml(feature, lang, assetsPrefix) : '';
  const cardsHtmlOut = cards.map(p => cardHtml(p, lang, assetsPrefix)).join('\n');
  return `\n${featureHtmlOut}\n    <div class="news-list">\n${cardsHtmlOut}\n    </div>\n    `;
}

function replaceBlock(html, replacement) {
  return html.replace(/(<!--cms:news_index-->)[\s\S]*?(<!--\/cms:news_index-->)/, `$1${replacement}$2`);
}

function storyPage(p) {
  const title = p.title_en || p.slug;
  const subtitle = p.subtitle || p.excerpt_en || '';
  const date = p.date_en || '';
  const readTime = p.read_time || '';
  const type = p.type_en || 'Press coverage';
  const image = p.image ? `<div class="bg"><img src="../../assets/news/${esc(p.image)}" alt="${esc(p.alt || title)}" /></div>` : '';
  const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="post-tag">${esc(t)}</span>`).join('');
  const sourceCredit = p.source_html ? `<p class="meta-credit">${p.source_html}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta name="robots" content="noindex,nofollow" />
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)} &mdash; Scale42</title>
<meta name="description" content="${esc(p.excerpt_en || subtitle)}" />
<meta name="theme-color" content="#1c2e3f" />
<link rel="canonical" href="https://www.scale-42.com/news/${esc(p.slug)}/" />
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Commissioner:wght@300;400;500;600;700&family=Lexend:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../styles.css" />
<style>
  .post-header { position: relative; min-height: 540px; display: flex; align-items: flex-end; color: #fff; overflow: hidden; background: linear-gradient(135deg, #1c2e3f 0%, #2f6675 60%, #4a8a6a 100%); }
  .post-header .bg { position: absolute; inset: 0; z-index: 0; }
  .post-header .bg img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .post-header .bg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28,46,63,0.45) 0%, rgba(28,46,63,0.15) 30%, rgba(28,46,63,0.85) 100%); }
  .post-header .container { position: relative; z-index: 1; padding-top: 96px; padding-bottom: 56px; max-width: 980px; }
  .post-header .crumbs { font-family: var(--font-display); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.85); font-weight: 600; margin: 0 0 24px; }
  .post-header .crumbs a { color: #fff; border-bottom: 1px solid rgba(255,255,255,0.4); }
  .post-header .crumbs .sep { opacity: 0.6; padding: 0 8px; }
  .post-header h1 { font-family: var(--font-display); font-size: clamp(32px, 4.8vw, 56px); line-height: 1.06; letter-spacing: -0.02em; margin: 0 0 20px; font-weight: 600; max-width: 900px; }
  .post-header .subtitle { font-size: 19px; line-height: 1.5; color: rgba(255,255,255,0.92); max-width: 720px; margin: 0 0 28px; font-weight: 300; }
  .post-header .byline { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; font-size: 13.5px; color: rgba(255,255,255,0.85); }
  .post-header .byline strong { color: #fff; font-weight: 600; }
  .post-header .byline .dot { color: rgba(255,255,255,0.4); }
  .post-tags { padding: 24px 0; border-bottom: 1px solid var(--line); }
  .post-tags .container { display: flex; gap: 8px; flex-wrap: wrap; }
  .post-tag { font-family: var(--font-display); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 5px 12px; border-radius: 999px; background: var(--bg-alt); color: var(--ink-2); font-weight: 600; }
  .post-body { padding: 64px 0 80px; }
  .post-body .container { max-width: 720px; }
  .post-body p { font-size: 18px; line-height: 1.75; color: var(--ink); margin: 0 0 22px; }
  .post-body p.lead { font-size: 22px; line-height: 1.55; font-weight: 400; margin: 0 0 32px; padding: 0 0 22px; border-bottom: 1px solid var(--line); }
  .post-body p.meta-credit { font-size: 13.5px; color: var(--muted); margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--line); font-style: italic; }
  .post-body blockquote { margin: 36px -16px; padding: 24px 32px; border-left: 4px solid var(--accent); background: var(--bg-alt); font-family: var(--font-display); font-size: 22px; line-height: 1.45; font-weight: 500; border-radius: 0 var(--radius) var(--radius) 0; }
  .post-body strong { font-weight: 600; }
  .post-body a { color: var(--accent); border-bottom: 1px solid rgba(47,102,117,0.35); }
  .post-body ul, .post-body ol { font-size: 17.5px; line-height: 1.7; padding-left: 22px; margin: 0 0 22px; }
  .post-body li { margin: 8px 0; }
  .post-body li::marker { color: var(--accent); }
  @media (max-width: 760px) { .post-header { min-height: 420px; } .post-body blockquote { margin: 28px 0; padding: 18px 22px; font-size: 19px; } }
</style>
</head>
<body>
<header class="nav">
  <div class="container nav-inner">
    <!--cms:nav-->
    <a class="brand" href="/"><img src="/assets/logo-wordmark-white.svg" alt="Scale42" class="brand-logo" /></a>
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded', this.nextElementSibling.classList.toggle('open'));"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    <nav class="nav-links">
      <a href="/">Home</a>
      <a href="/datacenters/">Data centres</a>
      <a href="/solutions/">Solutions</a>
      <a href="/sustainability/">Sustainability</a>
      <a href="/partners/">Partners</a>
      <a href="/about-us/">About Us</a>
      <a href="/news/" class="active">News</a>
      <a href="/contact/" class="btn btn-sm">Contact</a>
    </nav>
    <!--/cms:nav-->
  </div>
</header>
<section class="post-header">
  ${image}
  <div class="container">
    <p class="crumbs"><a href="../">News</a><span class="sep">/</span>${esc(type)}</p>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}
    <div class="byline">
      <span><strong>Scale42</strong></span>
      ${date ? `<span class="dot">&middot;</span><span>${esc(date)}</span>` : ''}
      ${readTime ? `<span class="dot">&middot;</span><span>${esc(readTime)}</span>` : ''}
    </div>
  </div>
</section>
${tags ? `<section class="post-tags"><div class="container">${tags}</div></section>` : ''}
<section class="post-body">
  <div class="container">
${p.body_html}
${sourceCredit}
  </div>
</section>
<footer class="footer">
  <div class="container">
    <!--cms:footer-->
    <div class="footer-grid">
      <div class="footer-col footer-brand">
        <img src="/assets/logo.svg" alt="Scale42" class="brand-logo brand-logo-footer" />
        <p class="footer-tag">Pan-Nordic AI &amp; HPC infrastructure &mdash; built on hydropower, geothermal and free-air cooling.</p>
        <p class="footer-contact"><a href="mailto:info@scale-42.com">info@scale-42.com</a></p>
      </div>
      <div class="footer-col"><h5>Platform</h5><a href="/solutions/">Solutions</a><a href="/datacenters/">Data centres</a><a href="/sustainability/">Sustainability</a><a href="/partners/">Partners</a></div>
      <div class="footer-col"><h5>Company</h5><a href="/about-us/">About Us</a><a href="/news/">News</a></div>
      <div class="footer-col"><h5>Resources</h5><a href="/news/rss.xml">RSS feed</a><a href="/sitemap.xml">Sitemap</a><a href="/privacy/">Privacy</a><a href="/contact/">Contact</a></div>
    </div>
    <div class="footer-bottom" style="justify-content:flex-end;">
      <p class="footer-legal" style="text-align:right;">Northern DC AS trading as Scale-42&trade; &middot; Registered in Norway &middot; &copy; 2026</p>
    </div>
    <!--/cms:footer-->
  </div>
</footer>
</body>
</html>
`;
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const p = path.join(ROOT, 'news/index.html');
  let html = fs.readFileSync(p, 'utf-8');
  html = replaceBlock(html, buildBlock(data.posts, 'en', '../'));
  fs.writeFileSync(p, html, 'utf-8');
  // Per-slug pages: only regenerate when body_html is present in news.json
  let storyCount = 0;
  for (const post of data.posts) {
    if (!post.body_html || !post.slug) continue;
    const dir = path.join(ROOT, 'news', post.slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), storyPage(post), 'utf-8');
    storyCount++;
  }
  try { require('./nav').run(); } catch (e) { console.warn('nav regen skipped:', e.message); }
  console.log(`regen news: done (${storyCount} story page(s) rebuilt)`);
}

module.exports = { run, files: ['content/news.json', 'news/index.html'] };

if (require.main === module) run();
