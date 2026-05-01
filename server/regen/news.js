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

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const targets = [
    { file: 'news/index.html', lang: 'en', prefix: '../' },
    { file: 'no/news/index.html', lang: 'no', prefix: '../../' },
  ];
  for (const t of targets) {
    const p = path.join(ROOT, t.file);
    let html = fs.readFileSync(p, 'utf-8');
    html = replaceBlock(html, buildBlock(data.posts, t.lang, t.prefix));
    fs.writeFileSync(p, html, 'utf-8');
  }
  console.log('regen news: done');
}

module.exports = { run, files: ['content/news.json', 'news/index.html', 'no/news/index.html'] };

if (require.main === module) run();
