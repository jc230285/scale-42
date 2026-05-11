// Canonical footer — single source of truth, like nav.js.
// Every public page must have <!--cms:footer-->...<!--/cms:footer-->.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const FOOTER_EN = `<div class="footer-grid">
      <div class="footer-col footer-brand">
        <img src="/assets/logo.svg" alt="Scale42" class="brand-logo brand-logo-footer" />
        <p class="footer-tag">Pan-Nordic AI &amp; HPC infrastructure — built on hydropower, geothermal and free-air cooling.</p>
        <p class="footer-contact"><a href="mailto:info@scale-42.com">info@scale-42.com</a></p>
      </div>
      <div class="footer-col">
        <h5>Platform</h5>
        <a href="/solutions/">Solutions</a>
        <a href="/datacenters/">Data centres</a>
        <a href="/sustainability/">Sustainability</a>
        <a href="/partners/">Partners</a>
      </div>
      <div class="footer-col">
        <h5>Company</h5>
        <a href="/about-us/">About Us</a>
        <a href="/news/">News</a>
      </div>
      <div class="footer-col">
        <h5>Resources</h5>
        <a href="/news/rss.xml">RSS feed</a>
        <a href="/sitemap.xml">Sitemap</a>
        <a href="/privacy/">Privacy</a>
        <a href="/contact/">Contact</a>
      </div>
    </div>
    <div class="footer-bottom" style="justify-content:flex-end;">
      <p class="footer-legal" style="text-align:right;">Northern DC AS trading as Scale-42™ · Registered in Norway · © 2026</p>
    </div>
`;

function injectFooter(html) {
  const block = FOOTER_EN;
  if (html.includes('<!--cms:footer-->')) {
    return html.replace(/<!--cms:footer-->[\s\S]*?<!--\/cms:footer-->/, `<!--cms:footer-->\n    ${block}\n    <!--/cms:footer-->`);
  }
  // First-time wrap: replace the existing simple footer-inner div content with markers.
  const re = /<div class="container footer-inner">[\s\S]*?<\/div>\s*<\/footer>/;
  if (re.test(html)) {
    return html.replace(re, `<div class="container">\n    <!--cms:footer-->\n    ${block}\n    <!--/cms:footer-->\n  </div>\n</footer>`);
  }
  return null;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'cms', 'cms-ui', 'server', 'scripts', 'assets', 'content'].includes(e.name)) continue;
      walk(p, out);
    } else if (e.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

function run() {
  const files = walk(ROOT);
  let ok = 0, miss = 0;
  for (const f of files) {
    let html = fs.readFileSync(f, 'utf-8');
    const out = injectFooter(html);
    if (out === null) { miss++; continue; }
    if (out !== html) fs.writeFileSync(f, out, 'utf-8');
    ok++;
  }
  console.log(`regen footer: ${ok} pages updated (${miss} skipped)`);
}

module.exports = { run };
if (require.main === module) run();
