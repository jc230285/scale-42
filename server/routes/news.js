const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'news.json');

router.get('/news', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.put('/news', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.posts)) return res.status(400).json({ error: 'invalid payload' });
  let before = null;
  try { before = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch {}
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  const audit = require('../audit');
  const entry = audit.record('news', req.cmsUser, before, body, 'save');
  res.json({ ok: true, audit: entry });
});

module.exports = router;
