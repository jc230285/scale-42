const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'people.json');

router.get('/people', (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  res.json(data);
});

router.put('/people', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.founders) || !Array.isArray(body.team)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  res.json({ ok: true });
});

module.exports = router;
