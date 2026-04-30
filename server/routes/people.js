const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'people.json');
const { buildSignatureHtml } = require('../signature');

router.get('/signature/:id', (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const p = data.people.find(x => x.id === req.params.id);
  if (!p) return res.status(404).send('Not found');
  const html = buildSignatureHtml(p);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${p.name} — Email signature</title><style>body{margin:40px;background:#f8fafb;font-family:sans-serif;}h1{font-size:14px;color:#6b7780;margin-bottom:16px;}.box{background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:24px;display:inline-block;}</style></head><body><h1>${p.name} — copy this signature into Gmail / Outlook</h1><div class="box">${html}</div></body></html>`);
});

router.get('/people', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.put('/people', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.people)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  let before = null;
  try { before = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch {}
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  const audit = require('../audit');
  const entry = audit.record('people', req.cmsUser, before, body, 'save');
  res.json({ ok: true, audit: entry });
});

module.exports = router;
