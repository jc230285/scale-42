const express = require('express');
const audit = require('../audit');

const router = express.Router();

router.get('/audit', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const section = req.query.section || null;
  res.json({ entries: audit.recent(limit, section) });
});

router.get('/whoami', (req, res) => {
  res.json(req.cmsUser || { username: 'unknown', name: 'unknown', email: '' });
});

module.exports = router;
