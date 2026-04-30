const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'sites.json');
const SCHEMA = path.resolve(__dirname, '..', '..', 'content', 'sites-schema.json');

router.get('/sites', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.get('/sites-schema', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(SCHEMA, 'utf-8')));
});

router.put('/sites', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.sites)) return res.status(400).json({ error: 'invalid payload' });
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  res.json({ ok: true });
});

module.exports = router;
