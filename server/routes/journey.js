const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'journey.json');

router.get('/journey', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.put('/journey', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.nodes)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const existing = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const before = JSON.parse(JSON.stringify(existing));
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  try {
    const audit = require('../audit');
    audit.record('journey', req.cmsUser, before, body, 'save');
  } catch {}
  res.json({ ok: true });
});

module.exports = router;
