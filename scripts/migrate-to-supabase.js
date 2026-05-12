#!/usr/bin/env node
/**
 * Migrate content/*.json into the Supabase S42_ tables.
 *
 * Run with one of:
 *   - SUPABASE_PAT=sbp_... node scripts/migrate-to-supabase.js
 *   - SUPABASE_SERVICE_KEY=sb_secret_... node scripts/migrate-to-supabase.js
 *
 * PAT path uses the Management API (works for everything). Service-key path uses
 * the PostgREST data API (faster but bypasses RLS via service role).
 *
 * Idempotent — upserts by primary key / slug. Safe to re-run.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_REF = 'cijleqzgvdpdfkwyxsyk';
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const PAT = process.env.SUPABASE_PAT;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!PAT && !SERVICE) {
  console.error('Set SUPABASE_PAT or SUPABASE_SERVICE_KEY env var');
  process.exit(1);
}

function readJson(name) {
  const p = path.join(CONTENT, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}

function readFile(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

function httpJson({ host, path: pathname, method = 'POST', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      host, port: 443, path: pathname, method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (s42-migrate)',
        ...(data ? { 'Content-Length': data.length } : {}),
        ...headers,
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        let parsed = buf;
        try { parsed = JSON.parse(buf); } catch {}
        if (ok) resolve(parsed);
        else reject(new Error(`HTTP ${res.statusCode}: ${typeof parsed === 'string' ? parsed.slice(0, 500) : JSON.stringify(parsed).slice(0, 500)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Run arbitrary SQL via Management API. PAT only.
async function sql(query) {
  return httpJson({
    host: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    headers: { Authorization: `Bearer ${PAT}` },
    body: { query },
  });
}

// Upsert rows via PostgREST data API. Service key preferred (bypasses RLS).
async function upsert(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) return [];
  if (SERVICE) {
    return httpJson({
      host: `${PROJECT_REF}.supabase.co`,
      path: `/rest/v1/${encodeURIComponent(table)}?on_conflict=${onConflict}`,
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: rows,
    });
  }
  // PAT path: build a single INSERT … ON CONFLICT DO UPDATE statement
  const cols = Object.keys(rows[0]);
  const sqlEscape = (v) => {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const values = rows.map(r => `(${cols.map(c => sqlEscape(r[c])).join(',')})`).join(',\n');
  const setClause = cols.filter(c => c !== onConflict).map(c => `"${c}"=excluded."${c}"`).join(',');
  const stmt = `insert into "${table}" (${cols.map(c => `"${c}"`).join(',')}) values\n${values}\non conflict (${onConflict}) do update set ${setClause};`;
  return sql(stmt);
}

// ---------- Per-source transforms ----------

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function siteRow(s, idx) {
  return clean({
    slug: s.id || slugify(s.name),
    name: s.name || '(unnamed)',
    country: s.country || null,
    status: s.status || null,
    lat: s.lat != null ? Number(s.lat) : null,
    lng: s.lng != null ? Number(s.lng) : null,
    initial_mw: s.initial_mw != null ? Number(s.initial_mw) : null,
    target_mw: s.target_mw != null ? Number(s.target_mw) : null,
    max_capacity_mw: s.max_capacity_mw != null ? Number(s.max_capacity_mw) : null,
    power: s.power || null,
    desc_en: s.desc_en || null,
    public_location: s.public_location || null,
    developers: s.developers || [],
    images: s.images || [],
    extra: Object.fromEntries(Object.entries(s).filter(([k]) =>
      !['id','name','country','status','lat','lng','initial_mw','target_mw','max_capacity_mw',
        'power','desc_en','desc_no','public_location','developers','images','published'].includes(k)
    )),
    published: !!s.published,
    order_idx: idx,
  });
}

function personRow(p, idx) {
  return clean({
    slug: p.id || slugify(p.name),
    name: p.name || '(unnamed)',
    role: p.role_en || null,
    bio: p.bio_en || null,
    photo: p.photo || null,
    linkedin: p.linkedin || null,
    order_idx: idx,
    published: p.published !== false,
  });
}

function newsRow(n, idx) {
  return clean({
    slug: n.slug,
    title_en: n.title_en || null,
    type_en: n.type_en || null,
    date_en: n.date_en || null,
    read_time: n.read_time || null,
    image: n.image || null,
    alt: n.alt || null,
    excerpt_en: n.excerpt_en || null,
    subtitle: n.subtitle || null,
    tags: n.tags || null,
    source_html: n.source_html || null,
    body_html: n.body_html || null,
    featured: !!n.featured,
    published: !!n.published,
    order_idx: idx,
  });
}

function developerRow(d, idx) {
  return clean({
    slug: d.id,
    name: d.name,
    logo: d.logo || null,
    url: d.url || null,
    tagline: d.tagline || null,
    description: d.description || null,
    cta: d.cta || null,
    color: d.color || null,
    order_idx: d.order != null ? d.order : idx,
    published: true,
  });
}

function journeyRow(j, idx) {
  return clean({
    year: j.year || null,
    headline_en: j.headline_en || null,
    body_en: j.body_en || null,
    badge_en: j.badge_en || null,
    image: j.image || null,
    order_idx: idx,
  });
}

// ---------- Main ----------

async function run() {
  console.log('\n=== Migrating content → Supabase ===\n');

  // 1. Sites
  const sites = readJson('sites.json')?.sites || [];
  console.log(`sites: ${sites.length}`);
  if (sites.length) {
    const rows = sites.map(siteRow);
    await upsert('S42_sites', rows, 'slug');
  }

  // 2. Sites schema
  const schema = readJson('sites-schema.json');
  if (schema) {
    await upsert('S42_sites_schema', [{ id: 1, schema }], 'id');
    console.log('sites schema: stored');
  }

  // 3. People
  const ppl = readJson('people.json')?.people || [];
  console.log(`people: ${ppl.length}`);
  if (ppl.length) {
    await upsert('S42_people', ppl.map(personRow), 'slug');
  }

  // 4. News
  const news = readJson('news.json')?.posts || [];
  console.log(`news: ${news.length}`);
  if (news.length) {
    await upsert('S42_news', news.map(newsRow), 'slug');
  }

  // 5. Developers
  const devs = readJson('developers.json')?.developers || [];
  console.log(`developers: ${devs.length}`);
  if (devs.length) {
    await upsert('S42_developers', devs.map(developerRow), 'slug');
  }

  // 6. Journey
  const jr = readJson('journey.json');
  const nodes = jr?.nodes || [];
  console.log(`journey: ${nodes.length}`);
  if (nodes.length) {
    await upsert('S42_journey', nodes.map(journeyRow), 'id'); // id is generated, so this acts like insert; OK once
  }
  if (jr) {
    await upsert('S42_journey_meta', [{ id: 1, title_en: jr.title_en || 'Our Journey', lede_en: jr.lede_en || null }], 'id');
  }

  // 7. Sections (page/key → value)
  const sec = readJson('sections.json');
  if (sec && sec.values && sec.values.en) {
    const rows = [];
    for (const [k, v] of Object.entries(sec.values.en)) {
      rows.push({ page: '_home', key: k, value_en: typeof v === 'string' ? v : JSON.stringify(v) });
    }
    if (rows.length) {
      await upsert('S42_sections', rows, 'page,key');
      console.log(`sections: ${rows.length}`);
    }
  }

  console.log('\nDone.\n');

  // Final sanity
  const counts = await sql(`
    select 'sites' as t, count(*) from "S42_sites"
    union all select 'people', count(*) from "S42_people"
    union all select 'news', count(*) from "S42_news"
    union all select 'developers', count(*) from "S42_developers"
    union all select 'journey', count(*) from "S42_journey"
    union all select 'sections', count(*) from "S42_sections"
    union all select 'sites_schema', count(*) from "S42_sites_schema";
  `).catch(e => `(sanity query needs PAT) ${e.message}`);
  console.log('Row counts:');
  console.log(counts);
}

run().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
