const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'sites.json');

function arrayLiteral(sites) {
  const lines = sites.filter(s => s.published).map(s =>
    `      { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, lat: ${s.lat}, lng: ${s.lng} }`
  );
  return `[\n${lines.join(',\n')},\n    ]`;
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const literal = arrayLiteral(data.sites);
  for (const file of ['index.html', 'no/index.html']) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, 'utf-8');
    html = html.replace(/(\/\*cms:sites_array\*\/)[\s\S]*?(\/\*\/cms:sites_array\*\/)/, `$1${literal}$2`);
    fs.writeFileSync(p, html, 'utf-8');
  }
  console.log('regen sites: done');
}

module.exports = { run, files: ['content/sites.json', 'index.html', 'no/index.html'] };

if (require.main === module) run();
