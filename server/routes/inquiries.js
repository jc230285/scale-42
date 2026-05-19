// Auth-required: view contact-form submissions stored on the running container.
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const INQ_PATH = process.env.INQUIRIES_PATH || path.resolve(__dirname, '..', '..', 'content', 'inquiries.json');

function loadAll() {
  try { return JSON.parse(fs.readFileSync(INQ_PATH, 'utf-8')).items || []; } catch { return []; }
}
function saveAll(items) {
  fs.mkdirSync(path.dirname(INQ_PATH), { recursive: true });
  fs.writeFileSync(INQ_PATH, JSON.stringify({ items }, null, 2) + '\n', 'utf-8');
}

router.get('/inquiries', (req, res) => {
  const items = loadAll();
  const blockedQ = String(req.query.blocked || 'all').toLowerCase();
  const country = String(req.query.country || '').toUpperCase();
  const domain = String(req.query.email_domain || '').toLowerCase();
  const q = String(req.query.q || '').toLowerCase();
  const sinceDays = parseInt(req.query.since_days, 10);
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);

  const cutoff = Number.isFinite(sinceDays) && sinceDays > 0 ? Date.now() - sinceDays * 86400000 : null;

  const filtered = items.filter(it => {
    if (blockedQ === 'none' && it.blocked) return false;
    if (blockedQ === 'spam' && !it.blocked) return false;
    if (blockedQ !== 'all' && blockedQ !== 'none' && blockedQ !== 'spam') {
      if ((it.blocked || '') !== blockedQ) return false;
    }
    if (country && (it.country || '').toUpperCase() !== country) return false;
    if (domain && (it.email_domain || '') !== domain) return false;
    if (cutoff) { const t = Date.parse(it.ts || ''); if (!Number.isFinite(t) || t < cutoff) return false; }
    if (q) {
      const blob = `${it.name||''} ${it.company||''} ${it.email||''} ${it.message||''} ${it.ip||''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  res.json({ total: items.length, matched: filtered.length, items: filtered.slice(0, limit) });
});

router.get('/inquiries/summary', (req, res) => {
  const items = loadAll();
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
  const cutoff = Date.now() - days * 86400000;
  const recent = items.filter(it => { const t = Date.parse(it.ts || ''); return Number.isFinite(t) && t >= cutoff; });

  const by = (arr, key) => {
    const m = {};
    for (const it of arr) { const k = it[key] || '—'; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const real = recent.filter(it => !it.blocked);
  const spam = recent.filter(it => it.blocked);

  res.json({
    window_days: days,
    total_all_time: items.length,
    in_window: recent.length,
    real: real.length,
    spam: spam.length,
    by_reason: by(spam, 'blocked'),
    by_country: by(recent, 'country'),
    by_domain_spam: by(spam, 'email_domain'),
  });
});

// Hourly buckets over the last N hours, separated by real vs blocked. Used by the
// CMS sparkline so attack waves are visible at a glance.
router.get('/inquiries/hourly', (req, res) => {
  const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 48, 6), 24 * 14);
  const now = Date.now();
  const startMs = now - hours * 3600_000;
  const buckets = Array.from({ length: hours }, (_, i) => ({
    hour: new Date(startMs + i * 3600_000).toISOString().slice(0, 13) + ':00',
    real: 0, blocked: 0,
  }));
  for (const it of loadAll()) {
    const t = Date.parse(it.ts || '');
    if (!Number.isFinite(t) || t < startMs || t > now) continue;
    const idx = Math.floor((t - startMs) / 3600_000);
    if (idx < 0 || idx >= hours) continue;
    if (it.blocked) buckets[idx].blocked += 1; else buckets[idx].real += 1;
  }
  res.json({ hours, buckets });
});

// Bulk-delete blocked entries. Real (non-blocked) entries are never touched.
// Optional ?reason= restricts deletion to a single block reason.
router.delete('/inquiries/blocked', (req, res) => {
  const reason = String(req.query.reason || '').toLowerCase();
  const items = loadAll();
  const before = items.length;
  const kept = items.filter(it => {
    if (!it.blocked) return true;
    if (reason && (it.blocked || '').toLowerCase() !== reason) return true;
    return false;
  });
  saveAll(kept);
  res.json({ removed: before - kept.length, remaining: kept.length });
});

// Manual ban list — IPs and /24 or /16 prefixes that should be blocked indefinitely.
const contact = require('./contact');
router.get('/inquiries/manual-bans', (_req, res) => {
  const s = contact.getRateState();
  res.json({ ips: s.manual.ips, subnets: s.manual.subnets });
});
router.post('/inquiries/manual-bans', express.json(), (req, res) => {
  const { target, reason } = req.body || {};
  const t = String(target || '').trim();
  if (!t) return res.status(400).json({ error: 'target required' });
  const s = contact.getRateState();
  const entry = { reason: String(reason || '').slice(0, 200), added: new Date().toISOString(), by: req.cmsUser?.username || '?' };
  // /24 or /16 prefix detection: "1.2.3" or "1.2"
  if (/^\d+\.\d+\.\d+$/.test(t) || /^\d+\.\d+$/.test(t)) s.manual.subnets[t] = entry;
  else if (/^\d+\.\d+\.\d+\.\d+$/.test(t)) s.manual.ips[t] = entry;
  else return res.status(400).json({ error: 'target must be an IPv4 address, /24 (a.b.c) or /16 (a.b)' });
  contact.persistRateState();
  res.json({ ok: true, manual: { ips: s.manual.ips, subnets: s.manual.subnets } });
});
router.delete('/inquiries/manual-bans/:target', (req, res) => {
  const t = String(req.params.target || '').trim();
  const s = contact.getRateState();
  let removed = false;
  if (s.manual.ips[t]) { delete s.manual.ips[t]; removed = true; }
  if (s.manual.subnets[t]) { delete s.manual.subnets[t]; removed = true; }
  contact.persistRateState();
  res.json({ ok: true, removed });
});

// One-click ban from a row: ban the IP of a given inquiry, optionally also the /24.
router.post('/inquiries/ban-ip', express.json(), (req, res) => {
  const ip = String((req.body && req.body.ip) || '').trim();
  const scope = String((req.body && req.body.scope) || 'ip').toLowerCase();
  const reason = String((req.body && req.body.reason) || 'banned from CMS').slice(0, 200);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return res.status(400).json({ error: 'invalid ip' });
  const s = contact.getRateState();
  const entry = { reason, added: new Date().toISOString(), by: req.cmsUser?.username || '?' };
  if (scope === 'subnet24' || scope === '/24') {
    const m = ip.match(/^(\d+\.\d+\.\d+)\./); if (m) s.manual.subnets[m[1]] = entry;
  } else {
    s.manual.ips[ip] = entry;
  }
  contact.persistRateState();
  res.json({ ok: true });
});

module.exports = router;
