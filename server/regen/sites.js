const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'sites.json');
const SCHEMA = path.join(ROOT, 'content', 'sites-schema.json');
const SECTIONS = path.join(ROOT, 'content', 'sections.json');

const parseMW = (s) => { const m = String(s || '').match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const fmtCapacity = (mw) => mw >= 1000 ? (mw / 1000).toFixed(mw % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' GW' : mw % 1 === 0 ? mw + ' MW' : mw.toFixed(1) + ' MW';
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL_EN = { live: 'In development', tbd: 'In planning', sold: 'Sold' };
const STATUS_LABEL_NO = { live: 'Under utvikling', tbd: 'I planlegging', sold: 'Solgt' };

function computeStats(sites) {
  const live = sites.filter(s => s.published);
  // pipeline excludes sold
  const pipelineSites = live.filter(s => s.status !== 'sold');
  const totalTarget = pipelineSites.reduce((a, s) => a + parseMW(s.max_capacity_mw || s.target_mw), 0);
  const caps = pipelineSites.map(s => parseMW(s.max_capacity_mw || s.target_mw)).filter(Boolean);
  const min = caps.length ? Math.min(...caps) : 0;
  const max = caps.length ? Math.max(...caps) : 0;
  const countries = new Set(live.map(s => s.country).filter(Boolean));
  return {
    pipeline: fmtCapacity(totalTarget),
    projects: String(live.length),
    capacity: caps.length ? `${min} – ${max}+ MW` : '—',
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
    return `    { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, lat: ${s.lat}, lng: ${s.lng}, power: ${JSON.stringify(s.power || '')}, target: ${JSON.stringify(s.max_capacity_mw || s.target_mw || '')}, desc: ${JSON.stringify(desc || '')} }`;
  });
  return `[\n${lines.join(',\n')},\n  ]`;
}

function siteSlug(s) {
  return (s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
}

function cardHtml(sites, lang) {
  const labels = lang === 'no' ? STATUS_LABEL_NO : STATUS_LABEL_EN;
  const initialL = lang === 'no' ? 'Oppstart' : 'Initial';
  const targetL = lang === 'no' ? 'Mål' : 'Target';
  const powerL = lang === 'no' ? 'Kraft' : 'Power';
  const linkL = lang === 'no' ? 'Se sitedetaljer →' : 'View site details →';
  return sites.filter(s => s.published).map(s => {
    const desc = lang === 'no' ? s.desc_no : s.desc_en;
    const country = escHtml(s.country);
    const ckey = String(s.country || '').toLowerCase();
    const slug = siteSlug(s);
    const imgInner = s.image
      ? `<img src="../assets/sites/${escHtml(s.image)}" alt="${escHtml(s.name)}" loading="lazy" />`
      : `<span class="image-placeholder">[ ${escHtml(s.name)} ]</span>`;
    const imgClass = s.image ? '' : (s.status === 'tbd' ? ' tbd' : '');
    const statusClass = s.status === 'tbd' ? 'tbd' : s.status === 'sold' ? 'sold' : 'live';
    const statusLabel = escHtml(s.short_status_label || labels[s.status] || labels.live);
    return `      <article class="dc-card" id="${escHtml(slug)}" data-country="${escHtml(ckey)}">
        <div class="img${imgClass}">
          <span class="country-flag">${country}</span>
          <span class="status ${statusClass}">${statusLabel}</span>
          ${imgInner}
        </div>
        <div class="body">
          <p class="loc">${country}</p>
          <h3>${escHtml(s.name)}</h3>
          <p class="desc">${escHtml(desc)}</p>
          <dl class="dc-stats">
            <div class="stat"><dt>${initialL}</dt><dd>${escHtml(s.initial_mw || '—')}</dd></div>
            <div class="stat"><dt>${targetL}</dt><dd>${escHtml(s.target_mw || s.max_capacity_mw || '—')}</dd></div>
            <div class="stat"><dt>${powerL}</dt><dd>${escHtml(s.power || '—')}</dd></div>
          </dl>
          <a href="${escHtml(slug)}/" class="dc-link">${linkL}</a>
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

function buildSiteDetailPage(s, schema, lang) {
  const isNo = lang === 'no';
  const labels = isNo ? STATUS_LABEL_NO : STATUS_LABEL_EN;
  const slug = siteSlug(s);
  const desc = isNo ? s.desc_no : s.desc_en;
  const status = s.status || 'tbd';
  const statusLabel = escHtml(s.short_status_label || labels[status] || labels.live);
  const statusClass = status === 'tbd' ? 'tbd' : status === 'sold' ? 'sold' : 'live';
  const COUNTRY_GRAD = {
    Norway: 'linear-gradient(135deg, #1c2e3f 0%, #2f6675 55%, #e8b87a 100%)',
    Finland: 'linear-gradient(135deg, #1c2e3f 0%, #406b6e 60%, #c4d4d3 100%)',
    Sweden: 'linear-gradient(135deg, #1c2e3f 0%, #5a4c3a 55%, #e8b87a 100%)',
    Iceland: 'linear-gradient(135deg, #2c3a48 0%, #5a4030 60%, #c47a4a 100%)',
    Greenland: 'linear-gradient(135deg, #1c2e3f 0%, #4a7080 55%, #d4e4ea 100%)',
  };
  const heroImgSrc = isNo
    ? `../../../assets/sites/${escHtml(s.image)}`
    : `../../assets/sites/${escHtml(s.image)}`;
  const heroImg = s.image
    ? `<div class="hero-frame"><img src="${heroImgSrc}" alt="${escHtml(s.name)}" /></div>`
    : `<div class="hero-frame" style="background:${COUNTRY_GRAD[s.country] || COUNTRY_GRAD.Norway};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.7);font-family:var(--font-display);font-size:48px;font-weight:600;letter-spacing:-0.02em;">${escHtml(s.country || '')}</div>`;

  // Public-only fields, grouped by schema group. Render every public field
  // (empty values shown as "—") so the structure is visible and editors can
  // see what's still to populate.
  const SKIP = new Set(['name', 'country', 'image', 'status', 'desc_en', 'desc_no', 'published', 'short_status_label']);
  const publicFields = schema.fields.filter(f => f.public && !SKIP.has(f.key));
  const groupOrder = schema.groups.filter(g => !g.internalOnly).map(g => g.key);
  const byGroup = {};
  for (const f of publicFields) {
    if (!byGroup[f.group]) byGroup[f.group] = [];
    byGroup[f.group].push(f);
  }

  const fmt = (v, type) => {
    if (v === undefined || v === null || v === '') return '<span class="empty">—</span>';
    if (type === 'links') {
      const list = Array.isArray(v) ? v : [];
      if (!list.length) return '<span class="empty">—</span>';
      return list.map(n => {
        const url = escHtml(n.url || '');
        const title = escHtml(n.title || n.url || '');
        return url ? `<a href="${url}" target="_blank" rel="noopener">${title}</a>` : title;
      }).join('<br>');
    }
    if (Array.isArray(v)) return v.length ? v.map(escHtml).join(', ') : '<span class="empty">—</span>';
    if (type === 'toggle') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return '<span class="empty">—</span>';
    return escHtml(String(v));
  };

  const groupSections = groupOrder.filter(g => byGroup[g] && byGroup[g].length).map(g => {
    const groupMeta = schema.groups.find(x => x.key === g);
    const rows = byGroup[g].map(f => {
      return `<div class="kv"><dt>${escHtml(f.label)}</dt><dd>${fmt(s[f.key], f.type)}</dd></div>`;
    }).join('');
    return `<section class="kv-section"><h2>${escHtml(groupMeta.label)}</h2><dl class="kv-grid">${rows}</dl></section>`;
  }).join('\n');

  const backLink = isNo ? '../' : '../';
  const backText = isNo ? '← Tilbake til oversikt' : '← Back to all sites';
  const heroLede = isNo ? 'Datasenter-prosjekt' : 'Data centre project';

  return `<!doctype html>
<html lang="${isNo ? 'nb' : 'en'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escHtml(s.name)} — Scale42</title>
<meta name="description" content="${escHtml((desc || '').slice(0, 160))}" />
<meta name="theme-color" content="#1c2e3f" />
<link rel="icon" type="image/svg+xml" href="${isNo ? '../../../assets/favicon.svg' : '../../assets/favicon.svg'}" />
<link rel="canonical" href="https://www.scale-42.com/${isNo ? 'no/' : ''}datacenters/${escHtml(slug)}/" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Commissioner:wght@300;400;500;600;700&family=Lexend:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${isNo ? '../../../styles.css' : '../../styles.css'}" />
<style>
  .site-hero { padding: 56px 0 32px; }
  .site-hero .crumb a { color: var(--accent); font-weight: 600; font-size: 13px; }
  .site-hero h1 { font-family: var(--font-display); font-size: clamp(36px, 5vw, 56px); margin: 12px 0 8px; letter-spacing: -0.02em; line-height: 1.05; }
  .site-hero .meta { color: var(--ink-2); font-size: 16px; margin: 0 0 18px; }
  .site-hero .pill { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: #fff; }
  .site-hero .pill.live { background: var(--accent); }
  .site-hero .pill.tbd { background: var(--muted); }
  .site-hero .pill.sold { background: #33752f; }
  .site-hero .hero-frame { width: 100%; aspect-ratio: 24/9; border-radius: var(--radius); margin-top: 24px; overflow: hidden; }
  .site-hero .hero-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .site-body { padding: 32px 0 64px; }
  .site-body .lede { font-size: 19px; color: var(--ink); max-width: 720px; }
  .kv-section { padding: 32px 0; border-top: 1px solid var(--line); }
  .kv-section h2 { font-family: var(--font-display); font-size: 22px; margin: 0 0 18px; font-weight: 600; }
  .kv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px 32px; margin: 0; }
  .kv dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 4px; font-weight: 600; }
  .kv dd { margin: 0; font-size: 15px; color: var(--ink); }
  .kv dd .empty { color: var(--muted); }
</style>
</head>
<body>
<header class="nav">
  <div class="container nav-inner">
    <a class="brand" href="${isNo ? '../../' : '../../'}"><img src="${isNo ? '../../../assets/logo.svg' : '../../assets/logo.svg'}" alt="Scale42" class="brand-logo" /></a>
    <nav class="nav-links">
      <a href="../../">${isNo ? 'Hjem' : 'Home'}</a>
      <a href="../../capabilities/">${isNo ? 'Kapabiliteter' : 'Capabilities'}</a>
      <a href="${backLink}" class="active">${isNo ? 'Datasentre' : 'Data centres'}</a>
      <a href="../../news/">${isNo ? 'Nyheter' : 'News'}</a>
      <a href="../../#contact" class="btn btn-sm">${isNo ? 'Kontakt' : 'Contact'}</a>
      <div class="lang-toggle">
        <a href="${isNo ? '../../../datacenters/' + slug + '/' : '.'}" data-lang="en"${isNo ? '' : ' class="active"'}>EN</a>
        <a href="${isNo ? '.' : '../../no/datacenters/' + slug + '/'}" data-lang="no"${isNo ? ' class="active"' : ''}>NO</a>
      </div>
    </nav>
  </div>
</header>
<section class="site-hero">
  <div class="container">
    <p class="crumb"><a href="${backLink}">${backText}</a></p>
    <p class="eyebrow">${heroLede} · ${escHtml(s.country)}</p>
    <h1>${escHtml(s.name)}</h1>
    <p class="meta"><span class="pill ${statusClass}">${statusLabel}</span></p>
    ${heroImg}
  </div>
</section>
<section class="site-body">
  <div class="container">
    ${desc ? `<p class="lede">${escHtml(desc)}</p>` : ''}
    ${groupSections}
  </div>
</section>
<footer class="footer">
  <div class="container footer-inner">
    <img src="${isNo ? '../../../assets/logo.svg' : '../../assets/logo.svg'}" alt="Scale42" class="brand-logo brand-logo-footer" />
    <p class="copyright">© 2026 Scale42. All rights reserved.</p>
  </div>
</footer>
</body>
</html>
`;
}

function regenSiteDetailPages(sites, schema) {
  for (const s of sites) {
    const slug = siteSlug(s);
    for (const lang of ['en', 'no']) {
      const dir = path.join(ROOT, lang === 'no' ? 'no/datacenters' : 'datacenters', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), buildSiteDetailPage(s, schema, lang), 'utf-8');
    }
  }
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf-8'));
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

  // Per-site detail pages
  regenSiteDetailPages(data.sites, schema);

  // Sync sections.json
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
  files: ['content/sites.json', 'content/sites-schema.json', 'content/sections.json', 'index.html', 'no/index.html', 'datacenters/index.html', 'no/datacenters/index.html'],
};

if (require.main === module) run();
