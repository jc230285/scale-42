const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'sections.json');

router.get('/sections', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.put('/sections', (req, res) => {
  const body = req.body;
  if (!body || !body.values || !body.values.en || !body.values.no) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const existing = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const before = JSON.parse(JSON.stringify(existing));
  existing.values = body.values;
  fs.writeFileSync(FILE, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  const audit = require('../audit');
  const entry = audit.record('sections', req.cmsUser, before, existing, 'save');
  res.json({ ok: true, audit: entry });
});

module.exports = router;
