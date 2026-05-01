// Canonical nav: single source of truth for the public site menu.
// Every public page must have:
//   <header class="nav"><div class="container nav-inner">...<!--cms:nav-->...<!--/cms:nav-->...</div></header>
// This regen overwrites everything between the markers with the canonical nav for that page.
// All hrefs are absolute so they work from any depth.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const NAV_EN = ({ active, lang_no_href }) => `<a class="brand" href="/"><img src="/assets/logo.svg" alt="Scale42" class="brand-logo" /></a>
    <nav class="nav-links">
      <a href="/"${active==='home'?' class="active"':''}>Home</a>
      <a href="/capabilities/"${active==='capabilities'?' class="active"':''}>Capabilities</a>
      <a href="/datacenters/"${active==='datacenters'?' class="active"':''}>Data centres</a>
      <a href="/team/"${active==='team'?' class="active"':''}>Team</a>
      <a href="/news/"${active==='news'?' class="active"':''}>News</a>
      <a href="/#contact" class="btn btn-sm">Contact</a>
      <div class="lang-toggle">
        <a href="." data-lang="en" class="active">EN</a>
        <a href="${lang_no_href}" data-lang="no">NO</a>
      </div>
    </nav>`;

const NAV_NO = ({ active, lang_en_href }) => `<a class="brand" href="/no/"><img src="/assets/logo.svg" alt="Scale42" class="brand-logo" /></a>
    <nav class="nav-links">
      <a href="/no/"${active==='home'?' class="active"':''}>Hjem</a>
      <a href="/no/capabilities/"${active==='capabilities'?' class="active"':''}>Kapabiliteter</a>
      <a href="/no/datacenters/"${active==='datacenters'?' class="active"':''}>Datasentre</a>
      <a href="/no/team/"${active==='team'?' class="active"':''}>Team</a>
      <a href="/no/news/"${active==='news'?' class="active"':''}>Nyheter</a>
      <a href="/no/#contact" class="btn btn-sm">Kontakt</a>
      <div class="lang-toggle">
        <a href="${lang_en_href}" data-lang="en">EN</a>
        <a href="." data-lang="no" class="active">NO</a>
      </div>
    </nav>`;

// (relative path from ROOT) -> { lang, active, langSwitch }
const PAGES = [
  { file: 'index.html', lang: 'en', active: 'home', noPath: '/no/' },
  { file: 'capabilities/index.html', lang: 'en', active: 'capabilities', noPath: '/no/capabilities/' },
  { file: 'datacenters/index.html', lang: 'en', active: 'datacenters', noPath: '/no/datacenters/' },
  { file: 'team/index.html', lang: 'en', active: 'team', noPath: '/no/team/' },
  { file: 'news/index.html', lang: 'en', active: 'news', noPath: '/no/news/' },
  { file: 'careers/index.html', lang: 'en', active: null, noPath: '/no/careers/' },
  { file: 'press/index.html', lang: 'en', active: null, noPath: '/no/press/' },
  { file: 'brand/index.html', lang: 'en', active: null, noPath: '/no/' },
  { file: 'competitors/index.html', lang: 'en', active: null, noPath: '/no/' },
  { file: '404.html', lang: 'en', active: null, noPath: '/no/' },
  { file: 'no/index.html', lang: 'no', active: 'home', enPath: '/' },
  { file: 'no/capabilities/index.html', lang: 'no', active: 'capabilities', enPath: '/capabilities/' },
  { file: 'no/datacenters/index.html', lang: 'no', active: 'datacenters', enPath: '/datacenters/' },
  { file: 'no/team/index.html', lang: 'no', active: 'team', enPath: '/team/' },
  { file: 'no/news/index.html', lang: 'no', active: 'news', enPath: '/news/' },
  { file: 'no/careers/index.html', lang: 'no', active: null, enPath: '/careers/' },
  { file: 'no/press/index.html', lang: 'no', active: null, enPath: '/press/' },
  { file: 'no/404.html', lang: 'no', active: null, enPath: '/404.html' },
];

// News article + datacenter detail pages too
function discoverDetailPages() {
  const out = [];
  // Signatures index + per-person pages.
  const sigIdx = path.join(ROOT, 'signatures', 'index.html');
  if (fs.existsSync(sigIdx)) out.push({ file: 'signatures/index.html', lang: 'en', active: null, noPath: '/no/' });
  const sigDir = path.join(ROOT, 'signatures');
  if (fs.existsSync(sigDir)) {
    for (const e of fs.readdirSync(sigDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(sigDir, e.name, 'index.html');
      if (fs.existsSync(f)) out.push({ file: 'signatures/' + e.name + '/index.html', lang: 'en', active: null, noPath: '/no/' });
    }
  }
  for (const dir of ['news', 'no/news', 'datacenters', 'no/datacenters']) {
    const root = path.join(ROOT, dir);
    if (!fs.existsSync(root)) continue;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(root, e.name, 'index.html');
      if (!fs.existsSync(f)) continue;
      const isNo = dir.startsWith('no/');
      const isDc = dir.endsWith('datacenters');
      const slug = e.name;
      out.push({
        file: path.relative(ROOT, f).replace(/\\/g, '/'),
        lang: isNo ? 'no' : 'en',
        active: isDc ? 'datacenters' : 'news',
        ...(isNo
          ? { enPath: (isDc ? '/datacenters/' : '/news/') + slug + '/' }
          : { noPath: '/no/' + (isDc ? 'datacenters/' : 'news/') + slug + '/' }),
      });
    }
  }
  return out;
}

function buildNav(p) {
  if (p.lang === 'no') return NAV_NO({ active: p.active, lang_en_href: p.enPath || '/' });
  return NAV_EN({ active: p.active, lang_no_href: p.noPath || '/no/' });
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
