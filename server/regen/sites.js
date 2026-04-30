const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'sites.json');
const SECTIONS = path.join(ROOT, 'content', 'sections.json');

const parseMW = (s) => { const m = String(s || '').match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const fmtCapacity = (mw) => mw >= 1000 ? (mw / 1000).toFixed(mw % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' GW' : mw % 1 === 0 ? mw + ' MW' : mw.toFixed(1) + ' MW';
const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL_EN = { live: 'In development', tbd: 'In planning', sold: 'Sold' };
const STATUS_LABEL_NO = { live: 'Under utvikling', tbd: 'I planlegging', sold: 'Solgt' };

function computeStats(sites) {
  const live = sites.filter(s => s.published);
  const totalTarget = live.reduce((a, s) => a + parseMW(s.target_mw), 0);
  const targets = live.map(s => parseMW(s.target_mw)).filter(Boolean);
  const min = targets.length ? Math.min(...targets) : 0;
  const max = targets.length ? Math.max(...targets) : 0;
  const countries = new Set(live.map(s => s.country).filter(Boolean));
  return {
    pipeline: fmtCapacity(totalTarget),
    projects: String(live.length),
    capacity: targets.length ? `${min} – ${max}+ MW` : '—',
    countries: String(countries.size),
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

function cardHtml(sites, lang) {
  const labels = lang === 'no' ? STATUS_LABEL_NO : STATUS_LABEL_EN;
  const detailWord = lang === 'no' ? 'Se sitedetaljer →' : 'View site details →';
  const initialL = lang === 'no' ? 'Oppstart' : 'Initial';
  const targetL = lang === 'no' ? 'Mål' : 'Target';
  const powerL = lang === 'no' ? 'Kraft' : 'Power';
  return sites.filter(s => s.published).map(s => {
    const desc = lang === 'no' ? s.desc_no : s.desc_en;
    const country = escHtml(s.country);
    const ckey = String(s.country || '').toLowerCase();
    const slug = (s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
    const imgInner = s.image
      ? `<img src="../assets/sites/${escHtml(s.image)}" alt="${escHtml(s.name)}" loading="lazy" />`
      : `<span class="image-placeholder">[ ${escHtml(s.name)} — site image ]</span>`;
    const imgClass = s.image ? '' : (s.status === 'tbd' ? ' tbd' : '');
    return `      <article class="dc-card" id="${escHtml(slug)}" data-country="${escHtml(ckey)}">
        <div class="img${imgClass}">
          <span class="country-flag">${country}</span>
          <span class="status ${s.status === 'tbd' ? 'tbd' : s.status === 'sold' ? 'sold' : 'live'}">${escHtml(labels[s.status] || labels.live)}</span>
          ${imgInner}
        </div>
        <div class="body">
          <p class="loc">${country}</p>
          <h3>${escHtml(s.name)}</h3>
          <p class="desc">${escHtml(desc)}</p>
          <dl class="dc-stats">
            <div class="stat"><dt>${initialL}</dt><dd>${escHtml(s.initial_mw || '—')}</dd></div>
            <div class="stat"><dt>${targetL}</dt><dd>${escHtml(s.target_mw || '—')}</dd></div>
            <div class="stat"><dt>${powerL}</dt><dd>${escHtml(s.power || '—')}</dd></div>
          </dl>
        </div>
      </article>`;
  }).join('\n\n');
}

function replaceJs(html, marker, replacement) {
  const re = new RegExp(`(\\/\\*cms:${marker}\\*\\/)[\\s\\S]*?(\\/\\*\\/cms:${marker}\\*\\/)`);
  return html.replace(re, `$1${replacement}$2`);
}

function replaceHtmlBlock(html, marker, replacement) {
  const re = new RegExp(`(<!--cms:${marker}-->)([\\s\\S]*?)(<!--/cms:${marker}-->)`);
  return html.replace(re, `$1\n\n${replacement}\n\n    $3`);
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const stats = computeStats(data.sites);

  // Map array literals (JS)
  const jsTargets = [
    { file: 'index.html', marker: 'sites_array', literal: homeArrayLiteral(data.sites) },
    { file: 'no/index.html', marker: 'sites_array', literal: homeArrayLiteral(data.sites) },
    { file: 'datacenters/index.html', marker: 'sites_full', literal: fullArrayLiteral(data.sites, 'en') },
    { file: 'no/datacenters/index.html', marker: 'sites_full', literal: fullArrayLiteral(data.sites, 'no') },
  ];
  for (const t of jsTargets) {
    const p = path.join(ROOT, t.file);
    const html = fs.readFileSync(p, 'utf-8');
    fs.writeFileSync(p, replaceJs(html, t.marker, t.literal), 'utf-8');
  }

  // Home hero stat markers
  for (const file of ['index.html', 'no/index.html']) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, 'utf-8');
    html = updateMarker(html, 'stat1_value', stats.pipeline);
    html = updateMarker(html, 'stat2_value', stats.projects);
    html = updateMarker(html, 'stat3_value', stats.capacity);
    fs.writeFileSync(p, html, 'utf-8');
  }

  // Datacenters page hero stats + cards
  const dcPages = [
    { file: 'datacenters/index.html', lang: 'en' },
    { file: 'no/datacenters/index.html', lang: 'no' },
  ];
  for (const { file, lang } of dcPages) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, 'utf-8');
    html = updateMarker(html, 'dc_pipeline', stats.pipeline);
    html = updateMarker(html, 'dc_projects', stats.projects);
    html = updateMarker(html, 'dc_countries', stats.countries);
    if (lang === 'en') {
      html = updateMarker(html, 'dc_hero_title', `${stats.pipeline} of Nordic AI-ready capacity.`);
      html = updateMarker(html, 'dc_hero_lede', `${stats.projects} projects across ${stats.countries} Nordic countries — co-located with low-cost renewable power, purpose-built for high-density compute. Scaling from 50 MW campus deployments to 500 MW+ flagship sites.`);
    } else {
      html = updateMarker(html, 'dc_hero_title', `${stats.pipeline} KI-klar nordisk kapasitet.`);
      html = updateMarker(html, 'dc_hero_lede', `${stats.projects} prosjekter i ${stats.countries} nordiske land — samlokalisert med rimelig fornybar kraft, spesialbygget for høytetthetsberegning. Skalerer fra 50 MW-campus til 500 MW+ flaggskipssteder.`);
    }
    html = replaceHtmlBlock(html, 'dc_cards', cardHtml(data.sites, lang));
    fs.writeFileSync(p, html, 'utf-8');
  }

  // Sync sections.json (auto-from-Sites)
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
