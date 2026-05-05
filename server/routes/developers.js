const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'developers.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
  catch { return { developers: [] }; }
}

router.get('/developers', (_req, res) => res.json(read()));

router.put('/developers', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.developers)) return res.status(400).json({ error: 'invalid payload' });
  const before = read();
  for (const d of body.developers) {
    if (!d.id || !d.name) return res.status(400).json({ error: 'each partner needs id + name' });
  }
  body.developers.sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  const audit = require('../audit');
  const entry = audit.record('developers', req.cmsUser, before, body, 'save');
  res.json({ ok: true, audit: entry });
});

module.exports = router;
