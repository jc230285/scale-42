// Parse the big internal spreadsheet (sites_extra.csv) and merge into sites.json.
// Handles quoted multi-line cells. Maps DB Field labels to schema keys via
// MAPPING below. Unmapped non-empty fields go into per-site extra_data so
// nothing is lost.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSV = path.join(ROOT, 'scripts', 'cache', 'sites_extra.csv');
const DATA = path.join(ROOT, 'content', 'sites.json');
const SCHEMA = path.join(ROOT, 'content', 'sites-schema.json');

// ---------- CSV parser (RFC 4180-ish) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const text = fs.readFileSync(CSV, 'utf-8');
const rows = parseCSV(text);
console.log('parsed rows:', rows.length, 'cols (max):', Math.max(...rows.map(r => r.length)));

// ---------- Header detection ----------
// Row index 2 (third row, 0-indexed) starts with "Projects" + has site labels in col 4 onward.
// Site label format: "Bo DC (NOR001) [Bo  Norway]" — slug is between [ ].
const headerRow = rows[2]; // "Projects" / "None" / "Calculate" / "lookup" / "Lookup" / [site labels]
const siteLabels = headerRow.slice(4); // first 4 cols are metadata
const sites = siteLabels.map(label => {
  if (!label) return null;
  const m = label.match(/\[([^\]]+)\]/);
  if (!m) return null;
  // "Bo  Norway" -> name "Bo", country "Norway" — split on last space
  const inner = m[1].trim().replace(/\s+/g, ' ');
  const parts = inner.split(' ');
  const country = parts[parts.length - 1];
  const name = parts.slice(0, -1).join(' ');
  return { name, country, slug: name.toLowerCase().replace(/[^a-z0-9]/g, '') };
});
console.log('site columns:', sites.filter(Boolean).length);
console.log('sites:', sites.filter(Boolean).map(s => `${s.name} [${s.country}]`).join(', '));

// ---------- Mapping: DB Field label -> schema key + transformer ----------
// Only the high-value rows we want to ingest into structured schema fields.
// Everything else goes into extra_data verbatim.
const MAPPING = {
  // identity
  'Project Name': { key: 'name', skipIfPresent: true },
  'Country': { key: 'country', skipIfPresent: true },
  'description': { key: 'project_description' },
  'Location': { key: 'address' },
  // power
  'Power Availability (Min)': { key: 'initial_mw_csv' },
  'Power Availability (Max)': { key: 'max_capacity_mw_csv' },
  'Connection Voltage': { key: 'connection_voltage' },
  'PPA Counterparty': { key: 'ppa_counterparty' },
  'DSO': { key: 'dso' },
  'TSO': { key: 'tso' },
  'Heat Reuse Option': { key: 'heat_reuse' },
  'Heat Reuse': { key: 'heat_reuse' },
  // location
  'Site Size (ha)': { key: 'size_ha_csv' },
  'Size (ha)': { key: 'size_ha_csv' },
  'Land Plots Identified': { key: 'plots_identified' },
  'Plots Secured': { key: 'plots_secured' },
  'Water Availability': { key: 'water_availability' },
  // commercial / status
  'JV (Global Interconnection Group)': { key: 'jv_partner_csv' },
  'Project Ownership': { key: 'project_owner' },
  'Status': { key: 'bid_status' },
  'Site Type': { key: 'site_type_csv' },
  'Type': { key: 'site_type_csv' },
  // connectivity
  'Fibre Providers': { key: 'fibre_providers_csv' },
  'Fibre Speeds': { key: 'fibre_speeds_gbps' },
  'Fibre Strands': { key: 'fibre_strands' },
  'Latency to key markets (ms) & Subsea Cables': { key: 'latency_summary' },
  // access
  'Highway access': { key: 'highway_access' },
  'Airport Access': { key: 'airport_access' },
  'College / Universities': { key: 'college_university' },
};

// ---------- Add new schema fields if missing ----------
const newFields = [
  { key: 'plots_identified', label: 'Plots identified', group: 'location', type: 'textarea', public: false },
  { key: 'plots_secured', label: 'Plots secured', group: 'location', type: 'textarea', public: false },
  { key: 'water_availability', label: 'Water availability', group: 'location', type: 'textarea', public: false },
  { key: 'extra_data', label: 'Other data (raw)', group: 'narrative', type: 'textarea', public: false },
];
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf-8'));
for (const nf of newFields) if (!schema.fields.find(f => f.key === nf.key)) schema.fields.push(nf);
fs.writeFileSync(SCHEMA, JSON.stringify(schema, null, 2) + '\n', 'utf-8');

// ---------- Walk data rows ----------
// Each data row: col 0 = DB Table, col 1 = DB Field, cols 4..N = per-site values.
// Also use the row in col 4 (Summary) as a description if relevant.
const perSite = sites.map(() => ({ extra: {} }));

let mappedCount = 0, totalRows = 0;
for (let r = 3; r < rows.length; r++) {
  const row = rows[r];
  const dbField = (row[1] || '').trim();
  if (!dbField || dbField === 'None' || dbField === 'NONE') continue;
  totalRows++;
  const map = MAPPING[dbField];
  for (let i = 0; i < sites.length; i++) {
    if (!sites[i]) continue;
    const v = (row[4 + i] || '').trim();
    if (!v) continue;
    if (map) {
      perSite[i][map.key] = v;
      mappedCount++;
    } else {
      perSite[i].extra[dbField] = v;
    }
  }
}
console.log(`mapped values: ${mappedCount}, unmapped DB rows: ${totalRows}`);

// ---------- Merge into sites.json ----------
const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
// Normalise Nordic chars and ignore non-alnum so e.g. "Honningsvåg" === "Honningsvag",
// "Lipiri" ≈ "Liperi" (we still require an exact-after-normalisation match — fuzzy
// names like Lipiri/Liperi or Kristenstad/Kristinestad are handled in NAME_ALIASES).
const norm = (n) => (n || '').toLowerCase()
  .replace(/å/g,'a').replace(/ä/g,'a').replace(/ø/g,'o').replace(/ö/g,'o')
  .replace(/ð/g,'d').replace(/þ/g,'th').replace(/é/g,'e').replace(/ü/g,'u')
  .replace(/[^a-z0-9]/g, '');
const NAME_ALIASES = {
  'lipiribackupforkontiolahti': 'liperi',
  'kristenstad': 'kristinestad',
  'puhos': 'kitee', // Puhos industrial park == Kitee
  'pirttikoski': 'rovaniemi', // Pirttikoski hydro is the Rovaniemi project
};
const resolveSlug = (n) => { const s = norm(n); return NAME_ALIASES[s] || s; };

let merged = 0, created = 0, missing = [];
for (let i = 0; i < sites.length; i++) {
  if (!sites[i] || !sites[i].name) continue;
  const wantSlug = resolveSlug(sites[i].name);
  let target = data.sites.find(s => norm(s.name) === wantSlug || norm(s.id) === wantSlug);
  if (!target) {
    // Create a new unpublished placeholder.
    target = {
      id: wantSlug,
      name: sites[i].name,
      country: sites[i].country,
      published: false,
      status: 'tbd',
      desc_en: '',
      desc_no: '',
    };
    data.sites.push(target);
    created++;
  }
  const src = perSite[i];

  // Apply mapped fields, preferring existing non-empty values for names/safe fields.
  for (const [k, v] of Object.entries(src)) {
    if (k === 'extra') continue;
    if (k.endsWith('_csv')) continue; // handle below
    // Don't overwrite existing values for protected keys.
    if (['name', 'country'].includes(k) && target[k]) continue;
    // For other fields: only set if target is empty or unset.
    if (target[k] === undefined || target[k] === null || target[k] === '' || (Array.isArray(target[k]) && target[k].length === 0)) {
      target[k] = v;
    }
  }
  // _csv variants are written into _csv-suffixed fields so editors can compare with existing.
  if (src.fibre_providers_csv && (!target.fibre_providers || target.fibre_providers.length === 0)) {
    target.fibre_providers = src.fibre_providers_csv.split(/[,/;]+/).map(s => s.trim()).filter(Boolean);
  }
  if (src.size_ha_csv && !target.size_ha) target.size_ha = src.size_ha_csv;
  if (src.site_type_csv && !target.site_type) {
    const t = src.site_type_csv.toLowerCase();
    target.site_type = t.includes('brown') && t.includes('green') ? 'mixed' : (t.includes('brown') ? 'brownfield' : 'greenfield');
  }
  if (src.initial_mw_csv && !target.initial_mw) target.initial_mw = src.initial_mw_csv + ' MW';
  if (src.max_capacity_mw_csv && !target.max_capacity_mw) target.max_capacity_mw = String(src.max_capacity_mw_csv).replace(/[^\d.]/g, '');
  if (src.jv_partner_csv && !target.jv_partner) {
    const v = src.jv_partner_csv.trim().toLowerCase();
    if (v === 'yes' || v === 'y') target.jv_partner = 'Global Interconnection Group';
    else if (v === 'no' || v === 'n') {} // skip
    else target.jv_partner = src.jv_partner_csv;
  }

  // Unmapped data: keep verbatim in extra_data as "Field: value" lines.
  const extraLines = Object.entries(src.extra)
    .filter(([k, v]) => v && v.length > 0 && v !== 'N/A' && v !== 'TBC' && v.length < 4000)
    .map(([k, v]) => `${k}: ${v.replace(/\s+/g, ' ').trim()}`);
  if (extraLines.length) {
    target.extra_data = (target.extra_data ? target.extra_data + '\n\n' : '') + extraLines.join('\n');
  }
  merged++;
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`merged ${merged} sites; missing in sites.json:`, missing);
