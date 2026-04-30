const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'people.json');

const escapeHtml = (s = '') => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function memberHtml(p, lang) {
  const role = lang === 'no' ? p.role_no : p.role_en;
  const bio = lang === 'no' ? p.bio_no : p.bio_en;
  const linkedin = p.linkedin
    ? `\n        <a href="${escapeHtml(p.linkedin)}" target="_blank" rel="noopener" class="linkedin" aria-label="LinkedIn">in</a>`
    : '';
  const photoSrc = (lang === 'no' ? '../' : '') + escapeHtml(p.photo);
  return `      <div class="member">
        <div class="member-photo"><img src="${photoSrc}" alt="${escapeHtml(p.name)}" /></div>
        <h4>${escapeHtml(p.name)}</h4>
        <p class="role">${escapeHtml(role || '')}</p>
        <p>${escapeHtml(bio || '')}</p>${linkedin}
      </div>`;
}

function blockHtml(people, klass, lang) {
  const inner = people.filter(p => p.published).map(p => memberHtml(p, lang)).join('\n');
  return `<div class="grid grid-3 ${klass}">\n${inner}\n    </div>`;
}

function replaceBlock(html, gridClass, replacement) {
  const opener = `<div class="grid grid-3 ${gridClass}">`;
  const start = html.indexOf(opener);
  if (start < 0) throw new Error(`block not found: ${gridClass}`);
  let i = start;
  let depth = 0;
  while (i < html.length) {
    const openIdx = html.indexOf('<div', i);
    const closeIdx = html.indexOf('</div>', i);
    if (closeIdx < 0) throw new Error('unbalanced');
    if (openIdx >= 0 && openIdx < closeIdx) { depth++; i = openIdx + 4; }
    else { depth--; i = closeIdx + 6; if (depth === 0) break; }
  }
  return html.slice(0, start) + replacement + html.slice(i);
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const founders = data.people.filter(p => p.is_founder);
  const team = data.people.filter(p => !p.is_founder);

  for (const lang of ['en', 'no']) {
    const file = path.join(ROOT, lang === 'no' ? 'no/index.html' : 'index.html');
    let html = fs.readFileSync(file, 'utf-8');
    html = replaceBlock(html, 'team founders', blockHtml(founders, 'team founders', lang));
    html = replaceBlock(html, 'team', blockHtml(team, 'team', lang));
    fs.writeFileSync(file, html, 'utf-8');
  }
  console.log('regen people: done');
}

module.exports = { run, files: ['content/people.json', 'index.html', 'no/index.html'] };

if (require.main === module) run();
