const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'sites.json');
const SECTIONS = path.join(ROOT, 'content', 'sections.json');

const parseMW = (s) => { const m = String(s || '').match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const fmtCapacity = (mw) => mw >= 1000 ? (mw / 1000).toFixed(mw % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' GW' : mw % 1 === 0 ? mw + ' MW' : mw.toFixed(1) + ' MW';

function computeStats(sites) {
  const live = sites.filter(s => s.published);
  const totalTarget = live.reduce((a, s) => a + parseMW(s.target_mw), 0);
  const targets = live.map(s => parseMW(s.target_mw)).filter(Boolean);
  const min = targets.length ? Math.min(...targets) : 0;
  const max = targets.length ? Math.max(...targets) : 0;
  return {
    pipeline: fmtCapacity(totalTarget),
    projects: String(live.length),
    capacity: targets.length ? `${min} – ${max}+ MW` : '—',
  };
}

function updateMarker(html, key, value) {
  const re = new RegExp(`(<!--cms:${key}-->)([\\s\\S]*?)(<!--/cms:${key}-->)`);
  return html.replace(re, `$1${value}$3`);
}

function homeArrayLiteral(sites) {
  const lines = sites.filter(s => s.published).map(s =>
    `      { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, lat: ${s.lat}, lng: ${s.lng} }`
  );
  return `[\n${lines.join(',\n')},\n    ]`;
}

function fullArrayLiteral(sites, lang) {
  const lines = sites.filter(s => s.published).map(s => {
    const desc = lang === 'no' ? s.desc_no : s.desc_en;
    return `    { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, lat: ${s.lat}, lng: ${s.lng}, power: ${JSON.stringify(s.power || '')}, target: ${JSON.stringify(s.target_mw || '')}, desc: ${JSON.stringify(desc || '')} }`;
  });
  return `[\n${lines.join(',\n')},\n  ]`;
}

function replace(html, marker, replacement) {
  const re = new RegExp(`(\\/\\*cms:${marker}\\*\\/)[\\s\\S]*?(\\/\\*\\/cms:${marker}\\*\\/)`);
  return html.replace(re, `$1${replacement}$2`);
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const stats = computeStats(data.sites);

  // Map array literals
  const arrayTargets = [
    { file: 'index.html', marker: 'sites_array', literal: homeArrayLiteral(data.sites) },
    { file: 'no/index.html', marker: 'sites_array', literal: homeArrayLiteral(data.sites) },
    { file: 'datacenters/index.html', marker: 'sites_full', literal: fullArrayLiteral(data.sites, 'en') },
    { file: 'no/datacenters/index.html', marker: 'sites_full', literal: fullArrayLiteral(data.sites, 'no') },
  ];
  for (const t of arrayTargets) {
    const p = path.join(ROOT, t.file);
    const html = fs.readFileSync(p, 'utf-8');
    fs.writeFileSync(p, replace(html, t.marker, t.literal), 'utf-8');
  }

  // Hero stat markers (stat1=Active pipeline value, stat2=Projects value, stat3=Site capacity value)
  for (const file of ['index.html', 'no/index.html']) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, 'utf-8');
    html = updateMarker(html, 'stat1_value', stats.pipeline);
    html = updateMarker(html, 'stat2_value', stats.projects);
    html = updateMarker(html, 'stat3_value', stats.capacity);
    fs.writeFileSync(p, html, 'utf-8');
  }

  // Keep sections.json in sync so the Sections editor reflects auto-computed values
  if (fs.existsSync(SECTIONS)) {
    const sec = JSON.parse(fs.readFileSync(SECTIONS, 'utf-8'));
    for (const lang of ['en', 'no']) {
      if (!sec.values[lang]) sec.values[lang] = {};
      sec.values[lang].stat1_value = stats.pipeline;
      sec.values[lang].stat2_value = stats.projects;
      sec.values[lang].stat3_value = stats.capacity;
    }
    fs.writeFileSync(SECTIONS, JSON.stringify(sec, null, 2) + '\n', 'utf-8');
  }

  console.log('regen sites: done', stats);
}

module.exports = {
  run,
  files: ['content/sites.json', 'content/sections.json', 'index.html', 'no/index.html', 'datacenters/index.html', 'no/datacenters/index.html'],
};

if (require.main === module) run();
