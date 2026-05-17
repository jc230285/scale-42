// Auth-required: view contact-form submissions stored on the running container.
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const INQ_PATH = path.resolve(__dirname, '..', '..', 'content', 'inquiries.json');

function loadAll() {
  try { return JSON.parse(fs.readFileSync(INQ_PATH, 'utf-8')).items || []; } catch { return []; }
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

module.exports = router;
