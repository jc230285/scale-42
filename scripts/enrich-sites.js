#!/usr/bin/env node
// Enrich content/sites.json from public sources.
// Sources: Wikipedia REST summary (extract + coords), Wikidata (P1082 population),
//          OurAirports CSV (nearest large/medium airport), curated Nordic seaport list.
// Only fills empty fields — never overwrites existing values.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'content', 'sites.json');
const CACHE_DIR = path.join(ROOT, 'scripts', 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const UA = 'scale-42-enrich/1.0 (https://scale-42.com)';

// Curated Nordic + adjacent commercial seaports (lat, lng).
const SEAPORTS = [
  { name: 'Reykjavík (Sundahöfn)', lat: 64.155, lng: -21.85 },
  { name: 'Húsavík', lat: 66.046, lng: -17.34 },
  { name: 'Akureyri', lat: 65.683, lng: -18.08 },
  { name: 'Reyðarfjörður', lat: 65.03, lng: -14.22 },
  { name: 'Helguvík', lat: 64.02, lng: -22.56 },
  { name: 'Narvik', lat: 68.435, lng: 17.43 },
  { name: 'Bodø', lat: 67.288, lng: 14.39 },
  { name: 'Mo i Rana', lat: 66.32, lng: 14.14 },
  { name: 'Mosjøen', lat: 65.83, lng: 13.20 },
  { name: 'Tromsø', lat: 69.65, lng: 18.96 },
  { name: 'Hammerfest', lat: 70.66, lng: 23.68 },
  { name: 'Kirkenes', lat: 69.73, lng: 30.05 },
  { name: 'Trondheim', lat: 63.44, lng: 10.40 },
  { name: 'Kristiansund', lat: 63.11, lng: 7.73 },
  { name: 'Ålesund', lat: 62.47, lng: 6.15 },
  { name: 'Oslo', lat: 59.90, lng: 10.74 },
  { name: 'Stavanger', lat: 58.97, lng: 5.73 },
  { name: 'Bergen', lat: 60.39, lng: 5.32 },
  { name: 'Luleå', lat: 65.58, lng: 22.15 },
  { name: 'Piteå', lat: 65.32, lng: 21.48 },
  { name: 'Skellefteå (Skelleftehamn)', lat: 64.69, lng: 21.23 },
  { name: 'Umeå (Holmsund)', lat: 63.70, lng: 20.36 },
  { name: 'Sundsvall', lat: 62.39, lng: 17.31 },
  { name: 'Gävle', lat: 60.68, lng: 17.18 },
  { name: 'Stockholm', lat: 59.33, lng: 18.07 },
  { name: 'Göteborg', lat: 57.69, lng: 11.83 },
  { name: 'Kemi (Ajos)', lat: 65.67, lng: 24.52 },
  { name: 'Oulu (Oritkari)', lat: 65.00, lng: 25.43 },
  { name: 'Raahe', lat: 64.69, lng: 24.48 },
  { name: 'Kokkola', lat: 63.85, lng: 23.02 },
  { name: 'Vaasa', lat: 63.10, lng: 21.57 },
  { name: 'Pori', lat: 61.59, lng: 21.50 },
  { name: 'Rauma', lat: 61.13, lng: 21.50 },
  { name: 'Turku', lat: 60.43, lng: 22.23 },
  { name: 'Helsinki (Vuosaari)', lat: 60.21, lng: 25.18 },
  { name: 'Kotka', lat: 60.46, lng: 26.95 },
  { name: 'Aarhus', lat: 56.15, lng: 10.22 },
  { name: 'Copenhagen', lat: 55.70, lng: 12.59 },
  { name: 'Nuuk', lat: 64.18, lng: -51.74 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API_CACHE_DIR = path.join(CACHE_DIR, 'api');
if (!fs.existsSync(API_CACHE_DIR)) fs.mkdirSync(API_CACHE_DIR, { recursive: true });
function cacheKey(url) {
  return require('crypto').createHash('sha1').update(url).digest('hex') + '.json';
}
async function fetchJsonCached(url, ttlDays = 30) {
  const file = path.join(API_CACHE_DIR, cacheKey(url));
  if (fs.existsSync(file) && (Date.now() - fs.statSync(file).mtimeMs) < ttlDays * 86400e3) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const j = await res.json();
  fs.writeFileSync(file, JSON.stringify(j));
  return j;
}

async function fetchJson(url) { return fetchJsonCached(url, 30); }

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// Wikipedia REST summary — by free text via search redirect
async function wikiSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
  try { return await fetchJson(url); } catch { return null; }
}

async function wikiSearch(q) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=${encodeURIComponent(q)}`;
  try {
    const j = await fetchJson(url);
    return (j && j[1] && j[1][0]) ? j[1][0] : null;
  } catch { return null; }
}

async function wikidataPopulation(qid) {
  if (!qid) return null;
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  try {
    const j = await fetchJson(url);
    const claims = j?.entities?.[qid]?.claims?.P1082 || [];
    let best = null;
    for (const c of claims) {
      const amt = c?.mainsnak?.datavalue?.value?.amount;
      if (!amt) continue;
      const n = parseInt(String(amt).replace('+', ''), 10);
      if (!Number.isFinite(n)) continue;
      const t = c?.qualifiers?.P585?.[0]?.datavalue?.value?.time || '';
      if (!best || t > best.t) best = { n, t };
    }
    return best ? best.n : null;
  } catch { return null; }
}

// GeoNames cities500 — all populated places >500. Used for radius-population.
async function loadCities() {
  const cache = path.join(CACHE_DIR, 'cities500.txt');
  if (!fs.existsSync(cache) || (Date.now() - fs.statSync(cache).mtimeMs) > 90 * 86400e3) {
    console.log('Downloading GeoNames cities500 (zip)…');
    const buf = Buffer.from(await (await fetch('https://download.geonames.org/export/dump/cities500.zip', { headers: { 'User-Agent': UA } })).arrayBuffer());
    const zipPath = path.join(CACHE_DIR, 'cities500.zip');
    fs.writeFileSync(zipPath, buf);
    const { execSync } = require('child_process');
    execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${CACHE_DIR}'"`);
  }
  const txt = fs.readFileSync(cache, 'utf8');
  const cities = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line) continue;
    const f = line.split('\t');
    const lat = parseFloat(f[4]), lng = parseFloat(f[5]), pop = parseInt(f[14], 10);
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(pop)) continue;
    cities.push({ lat, lng, pop });
  }
  return cities;
}

function populationWithin(coord, cities, km) {
  // crude bbox prefilter to skip haversine on far points
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos(coord.lat * Math.PI / 180) || 1);
  let total = 0;
  for (const c of cities) {
    if (Math.abs(c.lat - coord.lat) > dLat) continue;
    if (Math.abs(c.lng - coord.lng) > dLng) continue;
    if (haversineKm(coord, c) <= km) total += c.pop;
  }
  return total;
}

// OurAirports — cached
async function loadAirports() {
  const cache = path.join(CACHE_DIR, 'airports.csv');
  if (!fs.existsSync(cache) || (Date.now() - fs.statSync(cache).mtimeMs) > 30 * 86400e3) {
    console.log('Downloading OurAirports CSV…');
    const csv = await fetchText('https://davidmegginson.github.io/ourairports-data/airports.csv');
    fs.writeFileSync(cache, csv);
  }
  const csv = fs.readFileSync(cache, 'utf8');
  const lines = csv.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const idx = (k) => headers.indexOf(k);
  const iType = idx('type'), iName = idx('name'), iLat = idx('latitude_deg'),
        iLng = idx('longitude_deg'), iIata = idx('iata_code'), iIcao = idx('ident'),
        iScheduled = idx('scheduled_service');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (!row || row.length < headers.length) continue;
    const type = row[iType];
    if (type !== 'large_airport' && type !== 'medium_airport') continue;
    if (row[iScheduled] !== 'yes') continue;
    const lat = parseFloat(row[iLat]), lng = parseFloat(row[iLng]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    out.push({ name: row[iName], iata: row[iIata], icao: row[iIcao], type, lat, lng });
  }
  return out;
}

function parseCsvLine(line) {
  if (!line) return null;
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Latency-proxy hubs (great-circle km)
const HUBS = [
  { name: 'Frankfurt', lat: 50.110, lng: 8.682 },
  { name: 'Stockholm', lat: 59.330, lng: 18.065 },
  { name: 'London', lat: 51.507, lng: -0.128 },
  { name: 'Amsterdam', lat: 52.370, lng: 4.895 },
];

// Open-Meteo ERA5 archive: daily mean temp → avg temp, free-cooling hours, monthly series
async function climateFor(lat, lng, years = 3) {
  const end = new Date(); end.setDate(end.getDate() - 7);
  const start = new Date(end); start.setFullYear(end.getFullYear() - years);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    `&daily=temperature_2m_mean,temperature_2m_max&timezone=UTC`;
  try {
    const j = await fetchJsonCached(url, 180);
    const days = j?.daily?.time || [];
    const tmean = j?.daily?.temperature_2m_mean || [];
    const tmax = j?.daily?.temperature_2m_max || [];
    if (!days.length) return null;
    let sum = 0, n = 0, fcHours = 0;
    const monthly = {}; // 'YYYY-MM' → { sum, n }
    for (let i = 0; i < days.length; i++) {
      const t = tmean[i]; if (t == null) continue;
      sum += t; n++;
      // free-cooling proxy: hours/day with max < 18 °C
      if (tmax[i] != null && tmax[i] < 18) fcHours += 24;
      else if (t < 18) fcHours += 12;
      const ym = days[i].slice(0, 7);
      (monthly[ym] = monthly[ym] || { sum: 0, n: 0 }).sum += t;
      monthly[ym].n++;
    }
    if (!n) return null;
    const series = Object.keys(monthly).sort().map(k => ({ ym: k, t: +(monthly[k].sum / monthly[k].n).toFixed(1) }));
    return {
      avg_temp_c: (sum / n).toFixed(1),
      free_cooling_hours: String(Math.round(fcHours / years)),
      temp_chart: series,
    };
  } catch { return null; }
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearest(point, list) {
  let best = null;
  for (const p of list) {
    const km = haversineKm(point, p);
    if (!best || km < best.km) best = { ...p, km };
  }
  return best;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));
  const sites = data.sites;
  const airports = await loadAirports();
  const cities = await loadCities();
  console.log(`Loaded ${airports.length} airports, ${SEAPORTS.length} seaports, ${cities.length} cities.`);

  let changed = 0;
  for (const s of sites) {
    if (!s.public_location && !(s.lat && s.lng)) continue;
    const before = JSON.stringify(s);
    const query = s.public_location || `${s.name}, ${s.country}`;

    // Wikipedia summary
    let title = await wikiSearch(query);
    if (!title) title = query;
    const sum = await wikiSummary(title);
    if (sum && sum.type !== 'disambiguation') {
      if (!s.area_overview && sum.extract) s.area_overview = sum.extract;
      if ((!s.lat || !s.lng) && sum.coordinates) {
        s.lat = s.lat || sum.coordinates.lat;
        s.lng = s.lng || sum.coordinates.lon;
      }
      if (!s.population && sum.wikibase_item) {
        const pop = await wikidataPopulation(sum.wikibase_item);
        if (pop) s.population = String(pop);
      }
      if (!s.wikipedia_url && sum.content_urls?.desktop?.page) {
        s.wikipedia_url = sum.content_urls.desktop.page;
      }
    }

    // Nearest airport / seaport need a coord — prefer internal lat/lng
    const coord = (s.lat && s.lng) ? { lat: parseFloat(s.lat), lng: parseFloat(s.lng) } : null;
    if (coord) {
      if (!s.nearest_airport_public || !s.nearest_airport_km) {
        const a = nearest(coord, airports);
        if (a) {
          if (!s.nearest_airport_public) s.nearest_airport_public = a.iata ? `${a.name} (${a.iata})` : a.name;
          if (!s.nearest_airport_km) s.nearest_airport_km = String(Math.round(a.km));
        }
      }
      if (!s.nearest_seaport || !s.nearest_seaport_km) {
        const p = nearest(coord, SEAPORTS);
        if (p) {
          if (!s.nearest_seaport) s.nearest_seaport = p.name;
          if (!s.nearest_seaport_km) s.nearest_seaport_km = String(Math.round(p.km));
        }
      }
      if (!s.avg_temp_c || !s.free_cooling_hours || !s.temp_chart) {
        const c = await climateFor(coord.lat, coord.lng);
        if (c) {
          if (!s.avg_temp_c) s.avg_temp_c = c.avg_temp_c;
          if (!s.free_cooling_hours) s.free_cooling_hours = c.free_cooling_hours;
          if (!s.temp_chart) s.temp_chart = c.temp_chart;
        }
      }
      if (!s.population_50km) {
        s.population_50km = String(populationWithin(coord, cities, 50));
      }
      if (!s.hub_distances_km) {
        s.hub_distances_km = HUBS.map(h => `${h.name}: ${Math.round(haversineKm(coord, h))} km`).join(' · ');
      }
    }

    if (JSON.stringify(s) !== before) {
      changed++;
      console.log(`  ✓ ${s.name}: enriched`);
    }
    await sleep(150); // be polite to APIs
  }

  fs.writeFileSync(SITES_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`Done. ${changed}/${sites.length} sites updated.`);
})().catch((e) => { console.error(e); process.exit(1); });
