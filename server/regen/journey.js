const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const FILES = ['team/index.html', 'no/team/index.html'];

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderJourney(data, lang) {
  const title = lang === 'no' ? data.title_no : data.title_en;
  const lede = lang === 'no' ? data.lede_no : data.lede_en;
  const nodes = (data.nodes || []).map((n, i) => {
    const headline = lang === 'no' ? n.headline_no : n.headline_en;
    const body = lang === 'no' ? n.body_no : n.body_en;
    const badge = lang === 'no' ? n.badge_no : n.badge_en;
    const img = n.image ? `<div class="journey-img"><img src="${esc(n.image)}" alt="" loading="lazy" /></div>` : '';
    const badgeHtml = badge ? `<span class="journey-badge">${esc(badge)}</span>` : '';
    return `      <li class="journey-node">
        <div class="journey-marker" aria-hidden="true"></div>
        <div class="journey-content">
          <div class="journey-year">${esc(n.year)}${badgeHtml}</div>
          <h3 class="journey-headline">${esc(headline)}</h3>
          ${body ? `<p class="journey-body">${esc(body)}</p>` : ''}
          ${img}
        </div>
      </li>`;
  }).join('\n');

  return `<section class="journey-section">
  <div class="journey-pin" data-journey-pin>
    <div class="sticky">
      <div class="heading">
        <p class="eyebrow">${esc(title)}</p>
        <h2>${esc(lede)}</h2>
      </div>
      <ol class="journey" data-journey-track>
${nodes}
      </ol>
    </div>
  </div>
</section>
<script>
(function(){
  var pin = document.querySelector('[data-journey-pin]');
  if (!pin) return;
  var track = pin.querySelector('[data-journey-track]');
  if (!track) return;
  function setHeight(){
    var extra = Math.max(0, track.scrollWidth - window.innerWidth);
    pin.style.height = (window.innerHeight + extra) + 'px';
  }
  function onScroll(){
    var rect = pin.getBoundingClientRect();
    var max = pin.offsetHeight - window.innerHeight;
    if (max <= 0) { track.style.transform = ''; return; }
    var progress = Math.min(1, Math.max(0, -rect.top / max));
    var distance = Math.max(0, track.scrollWidth - window.innerWidth);
    track.style.transform = 'translateX(' + (-progress * distance) + 'px)';
  }
  setHeight();
  onScroll();
  window.addEventListener('resize', function(){ setHeight(); onScroll(); });
  window.addEventListener('scroll', onScroll, { passive: true });
})();
</script>`;
}

function injectJourney(html, block) {
  if (html.includes('<!--cms:journey-->')) {
    return html.replace(/<!--cms:journey-->[\s\S]*?<!--\/cms:journey-->/, `<!--cms:journey-->\n${block}\n<!--/cms:journey-->`);
  }
  // First-time: insert immediately after the hero section close </section>
  return html.replace(/(<\/section>\s*)/, `$1\n<!--cms:journey-->\n${block}\n<!--/cms:journey-->\n`);
}

function run() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'journey.json'), 'utf-8'));
  for (const rel of FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const lang = rel.startsWith('no/') ? 'no' : 'en';
    const html = fs.readFileSync(fp, 'utf-8');
    const out = injectJourney(html, renderJourney(data, lang));
    if (out !== html) fs.writeFileSync(fp, out, 'utf-8');
  }
  console.log(`regen journey: ${FILES.length} pages`);
}

module.exports = { run, files: FILES.concat(['content/journey.json']) };
if (require.main === module) run();
