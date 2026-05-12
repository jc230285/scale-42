// Canonical nav: single source of truth for the public site menu.
// Every public page must have:
//   <header class="nav"><div class="container nav-inner">...<!--cms:nav-->...<!--/cms:nav-->...</div></header>
// This regen overwrites everything between the markers with the canonical nav for that page.
// All hrefs are absolute so they work from any depth.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const NAV_EN = ({ active }) => `<a class="brand" href="/"><img src="/assets/logo-wordmark-white.svg" alt="Scale42" class="brand-logo" /></a>
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded', this.nextElementSibling.classList.toggle('open'));"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    <nav class="nav-links">
      <a href="/"${active==='home'?' class="active"':''}>Home</a>
      <a href="/datacenters/"${active==='datacenters'?' class="active"':''}>Data centres</a>
      <a href="/solutions/"${active==='solutions'?' class="active"':''}>Solutions</a>
      <a href="/sustainability/"${active==='sustainability'?' class="active"':''}>Sustainability</a>
      <a href="/partners/"${active==='giga42'?' class="active"':''}>Partners</a>
      <a href="/about-us/"${active==='team'?' class="active"':''}>About Us</a>
      <a href="/news/"${active==='news'?' class="active"':''}>News</a>
      <a href="/contact/"${active==='contact'?' class="btn btn-sm active"':' class="btn btn-sm"'}>Contact</a>
    </nav>`;

// (relative path from ROOT) -> { lang, active, langSwitch }
const PAGES = [
  { file: 'index.html', lang: 'en', active: 'home' },
  { file: 'solutions/index.html', lang: 'en', active: 'solutions' },
  { file: 'datacenters/index.html', lang: 'en', active: 'datacenters' },
  { file: 'sustainability/index.html', lang: 'en', active: 'sustainability' },
  { file: 'partners/index.html', lang: 'en', active: 'giga42' },
  { file: 'about-us/index.html', lang: 'en', active: 'team' },
  { file: 'news/index.html', lang: 'en', active: 'news' },
  { file: 'brand/index.html', lang: 'en', active: null },
  { file: 'competitors/index.html', lang: 'en', active: null },
  { file: '404.html', lang: 'en', active: null },
];

// News article + datacenter detail pages too
function discoverDetailPages() {
  const out = [];
  // Signatures index + per-person pages.
  const sigIdx = path.join(ROOT, 'signatures', 'index.html');
  if (fs.existsSync(sigIdx)) out.push({ file: 'signatures/index.html', lang: 'en', active: null });
  const sigDir = path.join(ROOT, 'signatures');
  if (fs.existsSync(sigDir)) {
    for (const e of fs.readdirSync(sigDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(sigDir, e.name, 'index.html');
      if (fs.existsSync(f)) out.push({ file: 'signatures/' + e.name + '/index.html', lang: 'en', active: null });
    }
  }
  for (const dir of ['news', 'datacenters']) {
    const root = path.join(ROOT, dir);
    if (!fs.existsSync(root)) continue;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(root, e.name, 'index.html');
      if (!fs.existsSync(f)) continue;
      const isDc = dir === 'datacenters';
      out.push({
        file: path.relative(ROOT, f).replace(/\\/g, '/'),
        lang: 'en',
        active: isDc ? 'datacenters' : 'news',
      });
    }
  }
  return out;
}

function buildNav(p) {
  return NAV_EN({ active: p.active });
}

function injectNav(html, navHtml) {
  if (html.includes('<!--cms:nav-->')) {
    return html.replace(/<!--cms:nav-->[\s\S]*?<!--\/cms:nav-->/, `<!--cms:nav-->\n    ${navHtml}\n    <!--/cms:nav-->`);
  }
  // First-time wrap: replace existing <a class="brand"...>...</nav> block with markers + canonical nav.
  const re = /<a class="brand"[\s\S]*?<\/nav>/;
  if (!re.test(html)) return null;
  return html.replace(re, `<!--cms:nav-->\n    ${navHtml}\n    <!--/cms:nav-->`);
}

function run() {
  const all = PAGES.concat(discoverDetailPages());
  let ok = 0, miss = [];
  for (const p of all) {
    const fp = path.join(ROOT, p.file);
    if (!fs.existsSync(fp)) { miss.push(p.file + ' (missing)'); continue; }
    let html = fs.readFileSync(fp, 'utf-8');
    const out = injectNav(html, buildNav(p));
    if (out === null) { miss.push(p.file + ' (no nav block)'); continue; }
    if (out !== html) fs.writeFileSync(fp, out, 'utf-8');
    ok++;
  }
  console.log(`regen nav: ${ok} pages updated`);
  if (miss.length) console.log('skipped:\n  ' + miss.join('\n  '));
}

module.exports = { run };
if (require.main === module) run();
