const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUDIT_FILE = path.join(ROOT, 'content', 'audit.jsonl');
const MAX_VAL_LEN = 200; // truncate large values in audit entries

function truncate(v) {
  if (v == null) return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_VAL_LEN ? s.slice(0, MAX_VAL_LEN) + '…' : (typeof v === 'string' ? v : v);
}

// Compare two arrays of objects keyed by `id` (or fallback to index).
// Returns flat list of {entity, path, before, after}.
function diffArrays(before, after, keyField, entityLabel) {
  const changes = [];
  const beforeMap = {};
  (before || []).forEach((o, i) => { beforeMap[o[keyField] || `idx:${i}`] = o; });
  const afterIds = new Set();
  (after || []).forEach((o, i) => {
    const id = o[keyField] || `idx:${i}`;
    afterIds.add(id);
    const prev = beforeMap[id];
    if (!prev) {
      changes.push({ entity: `${entityLabel}:${id}`, path: '_added', before: null, after: truncate(o.name || o.title_en || id) });
      return;
    }
    diffObject(prev, o, `${entityLabel}:${id}`, changes);
  });
  for (const id of Object.keys(beforeMap)) {
    if (!afterIds.has(id)) {
      changes.push({ entity: `${entityLabel}:${id}`, path: '_removed', before: truncate(beforeMap[id].name || beforeMap[id].title_en || id), after: null });
    }
  }
  return changes;
}

function diffObject(a, b, entity, changes) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (k.startsWith('_')) continue;
    const va = a?.[k];
    const vb = b?.[k];
    if (JSON.stringify(va) === JSON.stringify(vb)) continue;
    changes.push({ entity, path: k, before: truncate(va), after: truncate(vb) });
  }
}

function diffSection(section, before, after) {
  if (section === 'sites') return diffArrays(before?.sites, after?.sites, 'id', 'site');
  if (section === 'people') return diffArrays(before?.people, after?.people, 'id', 'person');
  if (section === 'news') return diffArrays(before?.posts, after?.posts, 'slug', 'post');
  if (section === 'sections') {
    const changes = [];
    for (const lang of ['en', 'no']) {
      const a = before?.values?.[lang] || {};
      const b = after?.values?.[lang] || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
        changes.push({ entity: `sections:${lang}`, path: k, before: truncate(a[k]), after: truncate(b[k]) });
      }
    }
    return changes;
  }
  return [];
}

function append(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(AUDIT_FILE, line, 'utf-8');
}

function record(section, user, before, after, action) {
  const changes = diffSection(section, before, after);
  if (!changes.length && action !== 'publish') return null;
  const entry = {
    ts: new Date().toISOString(),
    user: user?.username || 'unknown',
    user_name: user?.name || '',
    section,
    action: action || 'save',
    changes,
  };
  append(entry);
  return entry;
}

// Read last N entries (tail of jsonl)
function recent(limit = 50, sectionFilter) {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  const lines = fs.readFileSync(AUDIT_FILE, 'utf-8').split('\n').filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (!sectionFilter || o.section === sectionFilter) out.push(o);
    } catch {}
  }
  return out;
}

module.exports = { record, recent, AUDIT_FILE };
