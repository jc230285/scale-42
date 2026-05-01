const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'sections.json');

function replaceMarker(html, key, value) {
  const re = new RegExp(`(<!--cms:${key}-->)([\\s\\S]*?)(<!--/cms:${key}-->)`, 'g');
  return html.replace(re, `$1${value}$3`);
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  for (const lang of ['en', 'no']) {
    const file = path.join(ROOT, lang === 'no' ? 'no/index.html' : 'index.html');
    let html = fs.readFileSync(file, 'utf-8');
    const values = data.values[lang] || {};
    for (const [key, value] of Object.entries(values)) {
      html = replaceMarker(html, key, value);
    }
    fs.writeFileSync(file, html, 'utf-8');
  }
  try { require('./nav').run(); } catch (e) { console.warn('nav regen skipped:', e.message); }
  console.log('regen sections: done');
}

module.exports = { run, files: ['content/sections.json', 'index.html', 'no/index.html'] };

if (require.main === module) run();
