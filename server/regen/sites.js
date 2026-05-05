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

const COUNTRY_FLAG = { Norway: '🇳🇴', Finland: '🇫🇮', Sweden: '🇸🇪', Iceland: '🇮🇸', Greenland: '🇬🇱', Denmark: '🇩🇰' };

function deriveStatus(label) {
  if (!label) return 'tbd';
  const l = String(label).toLowerCase();
  if (l === 'sold') return 'sold';
  if (l === 'operational' || l === 'in development') return 'live';
  return 'tbd';
}

function computeStats(sites) {
  const live = sites.filter(s => s.published);
  // pipeline excludes sold
  const pipelineSites = live.filter(s => s.status !== 'sold');
  const totalMax = pipelineSites.reduce((a, s) => a + parseMW(s.max_capacity_mw || s.target_mw || s.initial_mw), 0);
  const caps = pipelineSites.map(s => parseMW(s.max_capacity_mw || s.target_mw || s.initial_mw)).filter(Boolean);
  const min = caps.length ? Math.min(...caps) : 0;
  const max = caps.length ? Math.max(...caps) : 0;
  const countries = new Set(live.map(s => s.country).filter(Boolean));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  return {
    pipeline: `${fmt(totalMax)} MW`,
    projects: String(live.length),
    capacity: caps.length ? `${Math.round(min)} – ${Math.round(max)} MW` : '—',
    countries: String(countries.size),
  };
}

function updateMarker(html, key, value) {
  const re = new RegExp(`(<!--cms:${key}-->)([\\s\\S]*?)(<!--/cms:${key}-->)`);
  return html.replace(re, `$1${value}$3`);
}

const round1 = (n) => Math.round(parseFloat(n) * 10) / 10;

function homeArrayLiteral(sites) {
  const lines = sites.filter(s => s.published && s.lat != null && s.lng != null).map(s =>
    `      { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, lat: ${round1(s.lat)}, lng: ${round1(s.lng)} }`
  );
  return `[\n${lines.join(',\n')},\n    ]`;
}

function fullArrayLiteral(sites, lang) {
  const lines = sites.filter(s => s.published && s.lat != null && s.lng != null).map(s => {
    const desc = lang === 'no' ? s.desc_no : s.desc_en;
    const loc = s.public_location || [s.name, s.country].filter(Boolean).join(', ');
    const tgt = s.max_capacity_mw || s.target_mw;
    const tgtStr = tgt != null && tgt !== '' ? `${tgt} MW` : '';
    return `    { name: ${JSON.stringify(s.name)}, country: ${JSON.stringify(s.country)}, status: ${JSON.stringify(s.status)}, location: ${JSON.stringify(loc)}, lat: ${round1(s.lat)}, lng: ${round1(s.lng)}, power: ${JSON.stringify(s.power || '')}, target: ${JSON.stringify(tgtStr)}, desc: ${JSON.stringify(desc || '')} }`;
  });
  return `[\n${lines.join(',\n')},\n  ]`;
}

function siteSlug(s) {
  return (s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
}

// Resolve a site.image (bare filename or full assets path) to a URL with the given prefix.
function resolveImg(image, basePrefix) {
  if (!image) return '';
  // If user/CMS stored the full path (e.g. "assets/sites/foo.jpg"), use it absolute.
  if (/^\/?assets\//i.test(image)) return '/' + String(image).replace(/^\/+/, '');
  return basePrefix + image;
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
      ? `<img src="${escHtml(resolveImg(s.image, '../assets/sites/'))}" alt="${escHtml(s.name)}" loading="lazy" />`
      : `<span class="image-placeholder">[ ${escHtml(s.name)} ]</span>`;
    const imgClass = s.image ? '' : (s.status === 'tbd' ? ' tbd' : '');
    const statusClass = s.status === 'tbd' ? 'tbd' : s.status === 'sold' ? 'sold' : 'live';
    const statusLabel = escHtml(s.public_status_label || labels[s.status] || labels.live);
    const stratKey = (s.strategic_status || '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
    const stratAttr = stratKey ? ` data-strat="${escHtml(stratKey)}"` : (s.status === 'sold' ? ' data-strat="sold"' : '');
    return `      <article class="dc-card" id="${escHtml(slug)}" data-country="${escHtml(ckey)}"${stratAttr}>
        <a class="dc-card-link" href="${escHtml(slug)}/" aria-label="${escHtml(s.name)}">view</a>
        <h3 class="dc-name-top">${escHtml(s.name)}</h3>
        <p class="loc loc-top">${country}</p>
        <span class="status ${statusClass}">${statusLabel}</span>
        <div class="img${imgClass}">
          ${imgInner}
        </div>
        <div class="body">
          <p class="desc">${escHtml(desc)}</p>
          <dl class="dc-stats">
            <div class="stat"><dt>${initialL}</dt><dd>${s.initial_mw != null && s.initial_mw !== '' ? escHtml(s.initial_mw) + ' MW' : '—'}</dd></div>
            <div class="stat"><dt>${targetL}</dt><dd>${(s.target_mw || s.max_capacity_mw) != null && (s.target_mw || s.max_capacity_mw) !== '' ? escHtml(s.target_mw || s.max_capacity_mw) + ' MW' : '—'}</dd></div>
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

function buildSiteDetailPage(s, schema, lang) {
  const isNo = lang === 'no';
  const labels = isNo ? STATUS_LABEL_NO : STATUS_LABEL_EN;
  const slug = siteSlug(s);
  const desc = isNo ? s.desc_no : s.desc_en;
  const status = s.status || 'tbd';
  const statusLabel = escHtml(s.public_status_label || labels[status] || labels.live);
  const statusClass = status === 'tbd' ? 'tbd' : status === 'sold' ? 'sold' : 'live';
  const COUNTRY_GRAD = {
    Norway: 'linear-gradient(135deg, #1c2e3f 0%, #2f6675 55%, #e8b87a 100%)',
    Finland: 'linear-gradient(135deg, #1c2e3f 0%, #406b6e 60%, #c4d4d3 100%)',
    Sweden: 'linear-gradient(135deg, #1c2e3f 0%, #5a4c3a 55%, #e8b87a 100%)',
    Iceland: 'linear-gradient(135deg, #2c3a48 0%, #5a4030 60%, #c47a4a 100%)',
    Greenland: 'linear-gradient(135deg, #1c2e3f 0%, #4a7080 55%, #d4e4ea 100%)',
  };
  const heroImgSrc = escHtml(resolveImg(s.image, isNo ? '../../../assets/sites/' : '../../assets/sites/'));
  const heroImg = s.image
    ? `<div class="hero-frame"><img src="${heroImgSrc}" alt="${escHtml(s.name)}" /></div>`
    : `<div class="hero-frame" style="background:${COUNTRY_GRAD[s.country] || COUNTRY_GRAD.Norway};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.7);font-family:var(--font-display);font-size:48px;font-weight:600;letter-spacing:-0.02em;">${escHtml(s.country || '')}</div>`;

  // Public-only fields, grouped by schema group. Render every public field
  // (empty values shown as "—") so the structure is visible and editors can
  // see what's still to populate.
  const SKIP = new Set(['name', 'country', 'image', 'status', 'desc_en', 'desc_no', 'published', 'short_status_label', 'public_status_label']);
  const publicFields = schema.fields.filter(f => f.public && !SKIP.has(f.key));
  const buildTempChart = (series) => {
    if (!series || series.length < 2) return '';
    const w = 1200, h = 220, padL = 36, padR = 12, padT = 12, padB = 28;
    const ts = series.map(p => p.t);
    const lo = Math.min(...ts), hi = Math.max(...ts);
    const niceLo = Math.floor(lo / 5) * 5, niceHi = Math.ceil(hi / 5) * 5;
    const span = (niceHi - niceLo) || 1;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const step = innerW / (series.length - 1);
    const xAt = (i) => padL + i * step;
    const yAt = (t) => padT + (1 - (t - niceLo) / span) * innerH;
    const pts = series.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.t).toFixed(1)}`);
    const path = `M ${pts.join(' L ')}`;
    const area = `M ${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} L ${pts.join(' L ')} L ${xAt(series.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
    // Y gridlines + labels every 5 °C
    let gridY = '';
    for (let v = niceLo; v <= niceHi; v += 5) {
      const y = yAt(v);
      gridY += `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" stroke="#e5eaee" stroke-width="1"/>`;
      gridY += `<text x="${padL - 6}" y="${y + 3}" font-size="10" fill="#7a8693" text-anchor="end">${v}°</text>`;
    }
    // X ticks: month label every 3 months, vertical line every 12 months (year boundary)
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let gridX = '';
    series.forEach((p, i) => {
      const [y, m] = p.ym.split('-').map(Number);
      const x = xAt(i);
      if (m === 1) {
        gridX += `<line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + innerH}" stroke="#cdd6df" stroke-width="1"/>`;
        gridX += `<text x="${x}" y="${h - 4}" font-size="11" fill="#1c2e3f" text-anchor="middle" font-weight="600">${y}</text>`;
      } else if ((m - 1) % 3 === 0) {
        gridX += `<line x1="${x}" x2="${x}" y1="${padT + innerH}" y2="${padT + innerH + 4}" stroke="#cdd6df" stroke-width="1"/>`;
        gridX += `<text x="${x}" y="${h - 14}" font-size="9" fill="#7a8693" text-anchor="middle">${MONTHS[m - 1]}</text>`;
      }
    });
    return `<div class="temp-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="3-year monthly mean temperature">${gridY}${gridX}<path d="${area}" fill="rgba(47,102,117,0.12)"/><path d="${path}" stroke="var(--accent)" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg><div class="temp-chart-meta"><span>${hi.toFixed(0)} °C max · ${lo.toFixed(0)} °C min</span></div></div>`;
  };

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

  const hasCoords = s.lat !== undefined && s.lat !== null && s.lat !== '' && s.lng !== undefined && s.lng !== null && s.lng !== '';
  const round1 = (n) => Math.round(parseFloat(n) * 100) / 100;
  const pubLat = hasCoords ? round1(s.lat) : null;
  const pubLng = hasCoords ? round1(s.lng) : null;
  const pubLoc = s.public_location || [s.name, s.country].filter(Boolean).join(', ');
  const mapBlock = (g) => (g === 'location' && pubLoc)
    ? `<div class="site-map-embed"><iframe src="https://www.google.com/maps?q=${encodeURIComponent(pubLoc)}&output=embed&z=11" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`
    : '';
  const heroMapBanner = '';

  // Power-source icons
  const POWER_ICON = { hydro: '💧', wind: '🌬️', geothermal: '♨️', solar: '☀️', nuclear: '⚛️', gas: '🔥', mixed: '⚡' };
  const powerIcons = (() => {
    const p = String(s.power || '').toLowerCase();
    const tokens = [];
    for (const key of Object.keys(POWER_ICON)) if (p.includes(key)) tokens.push({ key, icon: POWER_ICON[key] });
    if (!tokens.length && p) tokens.push({ key: p, icon: '⚡' });
    return tokens;
  })();
  const powerStrip = powerIcons.length
    ? `<div class="power-strip">${powerIcons.map(t => `<span class="power-chip"><span class="ico">${t.icon}</span> ${escHtml(t.key.charAt(0).toUpperCase() + t.key.slice(1))}</span>`).join('')}</div>`
    : '';

  // Hero KPI strip
  const fmtPop = s.population ? Number(s.population).toLocaleString() : null;
  const kpis = [
    { l: isNo ? 'Oppstart' : 'Initial', v: s.initial_mw != null && s.initial_mw !== '' ? `${s.initial_mw} MW` : null },
    { l: isNo ? 'Mål' : 'Target', v: (s.target_mw || s.max_capacity_mw) != null && (s.target_mw || s.max_capacity_mw) !== '' ? `${s.target_mw || s.max_capacity_mw} MW` : null },
    { l: isNo ? 'Kraft' : 'Power', v: s.power },
    { l: isNo ? 'Befolkning' : 'Population', v: fmtPop },
  ].filter(k => k.v);
  const heroStrip = kpis.length
    ? `<dl class="hero-stats">${kpis.map(k => `<div><dt>${escHtml(k.l)}</dt><dd>${escHtml(k.v)}</dd></div>`).join('')}</dl>`
    : '';

  // Climate block (if any climate signal present)
  const climateBits = [];
  if (s.avg_temp_c != null && s.avg_temp_c !== '') climateBits.push(`<div><dt>${isNo ? 'Snitt-temp' : 'Avg temp'}</dt><dd>${escHtml(s.avg_temp_c)} °C</dd></div>`);
  if (s.free_cooling_hours) climateBits.push(`<div><dt>${isNo ? 'Frikjøling' : 'Free cooling'}</dt><dd>${escHtml(Number(s.free_cooling_hours).toLocaleString())} h/yr</dd></div>`);
  const climateBlock = climateBits.length
    ? `<section class="climate-block"><h2>${isNo ? 'Klima og kjøling' : 'Climate & cooling'}</h2><dl class="climate-grid">${climateBits.join('')}</dl></section>`
    : '';

  const visibleGroups = groupOrder.filter(g => byGroup[g] && byGroup[g].length);
  const tocHtml = visibleGroups.length
    ? `<nav class="site-toc" aria-label="${isNo ? 'På denne siden' : 'On this page'}"><ul>${visibleGroups.map(g => {
        const m = schema.groups.find(x => x.key === g);
        return `<li><a href="#sec-${g}">${escHtml(m.label)}</a></li>`;
      }).join('')}</ul></nav>`
    : '';
  const groupSections = visibleGroups.map(g => {
    const groupMeta = schema.groups.find(x => x.key === g);
    const fields = byGroup[g];
    let rows = '';
    if (g === 'location') {
      const dirLink = (place) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pubLoc || s.country || '')}&destination=${encodeURIComponent(place)}`;
      const searchLink = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      const wikiLink = (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`;
      const locCell = pubLoc
        ? `<a href="${searchLink(pubLoc)}" target="_blank" rel="noopener">${escHtml(pubLoc)} ↗</a> · <a href="${wikiLink(pubLoc)}" target="_blank" rel="noopener">Wikipedia ↗</a>`
        : '<span class="empty">—</span>';
      rows += `<div class="kv"><dt>${isNo ? 'Sted' : 'Location'}</dt><dd>${locCell}</dd></div>`;
      const handled = new Set(['lat', 'lng', 'public_location', 'nearest_seaport', 'nearest_seaport_km', 'nearest_airport_public', 'nearest_airport_km', 'temp_chart', 'avg_temp_c']);
      // Combined seaport/airport rows with Google directions links
      if (s.nearest_seaport) {
        const km = s.nearest_seaport_km ? ` · ${escHtml(s.nearest_seaport_km)} km` : '';
        rows += `<div class="kv"><dt>${isNo ? 'Nærmeste havn' : 'Nearest seaport'}</dt><dd><a href="${dirLink(s.nearest_seaport)}" target="_blank" rel="noopener">${escHtml(s.nearest_seaport)} ↗</a>${km}</dd></div>`;
      }
      if (s.nearest_airport_public) {
        const km = s.nearest_airport_km ? ` · ${escHtml(s.nearest_airport_km)} km` : '';
        rows += `<div class="kv"><dt>${isNo ? 'Nærmeste flyplass' : 'Nearest airport'}</dt><dd><a href="${dirLink(s.nearest_airport_public)}" target="_blank" rel="noopener">${escHtml(s.nearest_airport_public)} ↗</a>${km}</dd></div>`;
      }
      rows += fields.filter(f => !handled.has(f.key)).map(f =>
        `<div class="kv"><dt>${escHtml(f.label)}</dt><dd>${fmt(s[f.key], f.type)}</dd></div>`).join('');
    } else if (g === 'access' && fields.some(f => f.key === 'nearest_airport')) {
      rows = fields.map(f => {
        if (f.key === 'nearest_airport') {
          const ap = s.nearest_airport;
          if (!ap) return `<div class="kv"><dt>${escHtml(f.label)}</dt><dd><span class="empty">—</span></dd></div>`;
          const dest = pubLoc;
          const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ap)}&destination=${encodeURIComponent(dest)}`;
          return `<div class="kv"><dt>${escHtml(f.label)}</dt><dd><a href="${url}" target="_blank" rel="noopener">${escHtml(ap)} ↗</a></dd></div>`;
        }
        return `<div class="kv"><dt>${escHtml(f.label)}</dt><dd>${fmt(s[f.key], f.type)}</dd></div>`;
      }).join('');
    } else {
      rows = fields.filter(f => f.key !== 'site_type').map(f => `<div class="kv"><dt>${escHtml(f.label)}</dt><dd>${fmt(s[f.key], f.type)}</dd></div>`).join('');
    }
    if (g === 'location') {
      let chartBlock = '';
      if (s.avg_temp_c != null && s.avg_temp_c !== '') {
        const chart = Array.isArray(s.temp_chart) ? buildTempChart(s.temp_chart) : '';
        chartBlock = `<div class="temp-row"><div class="temp-row-head"><span class="dt-label">${isNo ? 'Snitt-temp (3 år)' : 'Avg annual temp (3 yr)'}</span><span class="dt-val">${escHtml(String(s.avg_temp_c))} °C</span></div>${chart}</div>`;
      }
      return `<section id="sec-${g}" class="kv-section"><h2>${escHtml(groupMeta.label)}</h2><div class="loc-split"><dl class="kv-grid">${rows}</dl>${mapBlock(g)}</div>${chartBlock}</section>`;
    }
    // Skip sections where every public field is empty
    const hasData = fields.some(f => {
      const v = s[f.key];
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    });
    if (!hasData) return '';
    return `<section id="sec-${g}" class="kv-section"><h2>${escHtml(groupMeta.label)}</h2>${mapBlock(g)}<dl class="kv-grid">${rows}</dl></section>`;
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
<meta property="og:type" content="website" />
<meta property="og:title" content="${escHtml(s.name)} — Scale42" />
<meta property="og:description" content="${escHtml((desc || '').slice(0, 200))}" />
<meta property="og:url" content="https://www.scale-42.com/${isNo ? 'no/' : ''}datacenters/${escHtml(slug)}/" />
${s.image ? `<meta property="og:image" content="https://www.scale-42.com${resolveImg(s.image, '/assets/sites/')}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Place',
  name: s.name + ' Data Centre',
  description: desc || '',
  url: `https://www.scale-42.com/${isNo ? 'no/' : ''}datacenters/${slug}/`,
  ...(s.country ? { address: { '@type': 'PostalAddress', addressCountry: s.country, ...(s.public_location ? { addressLocality: s.public_location } : {}) } } : {}),
  ...(s.image ? { image: `https://www.scale-42.com${resolveImg(s.image, '/assets/sites/')}` } : {}),
  ...(s.population ? { isAccessibleForFree: false, slogan: `Near population of ${Number(s.population).toLocaleString()}` } : {}),
  containedInPlace: { '@type': 'Country', name: s.country || '' },
  ...(s.power || s.free_cooling_hours ? { amenityFeature: [
    ...(s.power ? [{ '@type': 'LocationFeatureSpecification', name: 'Power source', value: String(s.power) }] : []),
    ...(s.free_cooling_hours ? [{ '@type': 'LocationFeatureSpecification', name: 'Free-cooling hours/yr', value: Number(s.free_cooling_hours) }] : []),
  ] } : {}),
  provider: { '@type': 'Organization', name: 'Scale42', url: 'https://www.scale-42.com/' }
})}</script>
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
  .kv dd a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .kv dd a:hover { text-decoration: underline; }
  .site-map { width: 100%; height: 240px; border-radius: var(--radius); border: 1px solid var(--line); margin: 8px 0 4px; overflow: hidden; }
  .site-map .leaflet-container { background: #eaf0f3; cursor: default; }
  .site-map .dc-pin { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(28,46,63,0.25); }
  .site-map .dc-pin.tbd { background: var(--muted); }
  .site-map .dc-pin.sold { background: #33752f; }
  .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px 28px; margin: 22px 0 0; max-width: 760px; }
  .hero-stats > div { border-left: 2px solid var(--accent); padding-left: 14px; }
  .hero-stats dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 4px; font-weight: 600; }
  .hero-stats dd { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--ink); }
  .power-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; }
  .power-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(47,102,117,0.08); color: var(--accent); border: 1px solid rgba(47,102,117,0.2); padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .power-chip .ico { font-size: 15px; }
  .site-map-banner { padding: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .site-map-banner iframe { display: block; width: 100%; height: 360px; border: 0; }
  .site-toc { position: sticky; top: 70px; background: #fff; border-bottom: 1px solid var(--line); z-index: 10; padding: 10px 0; margin: 0 0 8px; }
  .site-toc ul { display: flex; gap: 18px; flex-wrap: wrap; list-style: none; padding: 0 24px; margin: 0; max-width: 1200px; margin: 0 auto; }
  .site-toc a { color: var(--ink-2); font-size: 13px; font-weight: 500; text-decoration: none; }
  .site-toc a:hover { color: var(--accent); }
  .climate-block { padding: 32px 0; border-top: 1px solid var(--line); }
  .climate-block h2 { font-family: var(--font-display); font-size: 22px; margin: 0 0 16px; font-weight: 600; }
  .climate-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px 28px; margin: 0; }
  .climate-grid > div { background: #f6f8fa; border-radius: 10px; padding: 16px; }
  .climate-grid dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  .climate-grid dd { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--ink); }
  .site-map-embed iframe { display: block; width: 100%; height: 100%; min-height: 320px; border: 0; border-radius: 12px; }
  .kv-wide { grid-column: 1 / -1; }
  .temp-row { margin: 24px 0 0; padding: 16px 0 0; border-top: 1px solid var(--line); }
  .temp-row-head { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 8px; }
  .temp-row-head .dt-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
  .temp-row-head .dt-val { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--ink); }
  .temp-chart svg { width: 100%; height: 220px; display: block; }
  .temp-chart-meta { display: flex; justify-content: flex-end; font-size: 11px; color: var(--muted); margin-top: 4px; }
  .pill.type-tag { background: rgba(47,102,117,0.12); color: var(--accent); border: 1px solid rgba(47,102,117,0.3); margin-left: 8px; text-transform: capitalize; font-weight: 600; }
  .loc-split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .loc-split .site-map-embed { position: sticky; top: 80px; height: 420px; }
  @media (max-width: 800px) { .loc-split { grid-template-columns: 1fr; } .loc-split .site-map-embed { position: static; height: 280px; } }
  .pdf-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--ink); color: #fff; border: 0; padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .pdf-btn:hover { background: var(--accent); color: #fff; }
  @page { size: A4; margin: 14mm; }
  @media print {
    .nav, .footer, .site-toc, .dc-cta, .site-map-banner, .pdf-btn, .site-map-embed { display: none !important; }
    body { color: #000; background: #fff; font-size: 11pt; }
    .site-hero { padding: 0 0 12mm; page-break-after: always; }
    .site-body { padding: 0; }
    .kv-section, .climate-block, .temp-row { page-break-before: always; page-break-inside: avoid; padding: 0 0 8mm; border-top: 0; }
    .kv-section h2, .climate-block h2 { font-size: 16pt; margin: 0 0 4mm; }
    .loc-split { display: block; }
    a { color: #000; text-decoration: none; }
    .hero-frame img { max-height: 80mm; width: 100%; object-fit: cover; }
    .temp-chart svg { height: 60mm; }
  }
</style>
</head>
<body>
<header class="nav">
  <div class="container nav-inner">
    <!--cms:nav-->
    <!-- nav is regenerated by server/regen/nav.js — do not edit here -->
    <!--/cms:nav-->
  </div>
</header>
<section class="site-hero">
  <div class="container">
    <p class="crumb"><a href="${backLink}">${backText}</a></p>
    <p class="eyebrow">${heroLede} · ${escHtml(s.country)}</p>
    <h1>${escHtml(s.name)}</h1>
    <p class="meta"><span class="pill ${statusClass}">${statusLabel}</span>${s.site_type ? `<span class="pill type-tag">${escHtml(s.site_type)}</span>` : ''}<a href="#" class="pdf-btn" onclick="window.print();return false;" style="margin-left:12px;">${isNo ? '⬇ Last ned PDF' : '⬇ Download PDF'}</a></p>
    ${heroImg}
  </div>
</section>
${heroMapBanner}
<section class="site-body">
  <div class="container">
    ${desc ? `<p class="lede">${escHtml(desc)}</p>` : ''}
    ${groupSections}
  </div>
</section>
<section class="dc-cta" style="background:var(--bg-dark);color:#e8ece9;padding:64px 0;text-align:center;">
  <div class="container">
    <h2 style="font-family:var(--font-display);font-size:clamp(28px,3vw,38px);margin:0 0 12px;font-weight:600;letter-spacing:-0.02em;color:#fff;">${isNo ? 'Vurderer du ' + escHtml(s.name) + '?' : 'Considering ' + escHtml(s.name) + '?'}</h2>
    <p style="color:#b9c2bd;margin:0 0 24px;font-size:17px;">${isNo ? 'Be om en RFI-pakke for dette spesifikke prosjektet — power, fibre, timeline, kommersielle vilkår.' : 'Request an RFI pack for this specific site — power, fibre, timeline, commercial terms.'}</p>
    <a href="mailto:info@scale-42.com?subject=${encodeURIComponent('RFI request — ' + s.name)}" class="btn btn-primary" style="background:#fff;color:var(--ink);">${isNo ? 'Be om RFI-pakke' : 'Request RFI pack'} →</a>
    <a href="../" class="btn" style="margin-left:8px;color:#fff;border-color:#fff;">${isNo ? 'Tilbake til alle sites' : 'Back to all sites'}</a>
  </div>
</section>
<footer class="footer">
  <div class="container">
    <!--cms:footer-->
    <!--/cms:footer-->
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
  // Auto-derive status from public_status_label so editors only manage one field
  for (const s of data.sites) {
    if (s.public_status_label) s.status = deriveStatus(s.public_status_label);
  }
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

  // Home hero stat markers — stat3 (campus scale) is editor-controlled / static.
  // stat1 (pipeline) and stat2 (active developments) auto-derive.
  for (const file of ['index.html', 'no/index.html']) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, 'utf-8');
    html = updateMarker(html, 'stat1_value', stats.pipeline);
    html = updateMarker(html, 'stat2_value', stats.projects);
    html = updateMarker(html, 'lede_capacity', stats.pipeline);
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

  // Regenerate the canonical nav into every page (incl. site detail pages
  // we just wrote with cms:nav placeholders).
  try { require('./nav').run(); } catch (e) { console.warn('nav regen skipped:', e.message); }

  console.log('regen sites: done', stats);
}

module.exports = {
  run,
  files: ['content/sites.json', 'content/sites-schema.json', 'content/sections.json', 'index.html', 'no/index.html', 'datacenters/index.html', 'no/datacenters/index.html'],
};

if (require.main === module) run();
