// Regen for the Partners page (/partners/ + /no/partners/) sourced from content/developers.json.
// Also re-runs sites regen so dc-card logos refresh when partner logos change.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'developers.json');

const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf-8')).developers || []; }
  catch { return []; }
}

function partnerCard(d, lang) {
  const logo = d.logo ? `<div class="partner-logo"><img src="${escHtml(d.logo)}" alt="${escHtml(d.name)}" loading="lazy" /></div>` : '';
  const tagline = d.tagline ? `<h2 class="partner-tagline">${escHtml(d.tagline)}</h2>` : '';
  const desc = d.description ? `<p class="partner-desc">${escHtml(d.description)}</p>` : '';
  const ctaLabel = d.cta || (lang === 'no' ? 'Besøk hjemmeside →' : 'Visit website →');
  const cta = d.url ? `<p style="margin:0;"><a href="${escHtml(d.url)}" class="btn btn-primary" target="_blank" rel="noopener">${escHtml(ctaLabel)}</a></p>` : '';
  return `<article class="partner-card">
      ${logo}
      <div class="partner-body">
        ${tagline}
        ${desc}
        ${cta}
      </div>
    </article>`;
}

function partnersHtml(lang) {
  const list = load().slice().sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
  return list.map(d => partnerCard(d, lang)).join('\n    ');
}

function replaceMarker(html, key, block) {
  const re = new RegExp(`(<!--cms:${key}-->)([\\s\\S]*?)(<!--/cms:${key}-->)`);
  if (!re.test(html)) return null;
  return html.replace(re, `$1\n    ${block}\n    $3`);
}

function rewritePage(file, lang) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf-8');
  const out = replaceMarker(html, 'partners', partnersHtml(lang));
  if (out === null) { console.warn(`partners marker missing in ${file}`); return false; }
  if (out !== html) fs.writeFileSync(file, out, 'utf-8');
  return true;
}

function run() {
  rewritePage(path.join(ROOT, 'partners', 'index.html'), 'en');
  rewritePage(path.join(ROOT, 'no', 'partners', 'index.html'), 'no');
  // Also refresh dc-card logos via sites regen
  try { require('./sites').run(); } catch (e) { console.warn('sites regen skipped:', e.message); }
  console.log('regen partners: done');
}

module.exports = {
  run,
  files: ['content/developers.json', 'partners/index.html', 'no/partners/index.html', 'datacenters/index.html', 'no/datacenters/index.html', 'index.html', 'no/index.html'],
};

if (require.main === module) run();
