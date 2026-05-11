const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const FILES = ['about-us/index.html'];

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
    return `      <li class="journey-node" style="grid-column:${i+1};">
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
      <div class="journey-scroll">
      <ol class="journey" data-journey-track>
${nodes}
      </ol>
      </div>
    </div>
  </div>
</section>
<script>
(function(){
  var track = document.querySelector('[data-journey-track]');
  if (!track) return;
  function positionLine(){
    if (window.innerWidth <= 800) { track.style.removeProperty('--journey-line-left'); track.style.removeProperty('--journey-line-right'); track.style.removeProperty('--journey-line-top'); return; }
    var markers = track.querySelectorAll('.journey-marker');
    if (markers.length < 2) return;
    var trackRect = track.getBoundingClientRect();
    var first = markers[0].getBoundingClientRect();
    var last = markers[markers.length - 1].getBoundingClientRect();
    var firstCenter = first.left + first.width/2 - trackRect.left;
    var lastCenter = last.left + last.width/2 - trackRect.left;
    track.style.setProperty('--journey-line-left', firstCenter + 'px');
    track.style.setProperty('--journey-line-right', (trackRect.width - lastCenter) + 'px');
    var second = markers[1].getBoundingClientRect();
    var midY = ((first.top + first.height/2) + (second.top + second.height/2)) / 2 - trackRect.top;
    track.style.setProperty('--journey-line-top', midY + 'px');
  }
  positionLine();
  window.addEventListener('resize', positionLine);
  window.addEventListener('load', positionLine);
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
