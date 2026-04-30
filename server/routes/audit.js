const express = require('express');
const audit = require('../audit');
const db = require('../db');

const router = express.Router();

router.get('/audit', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const section = req.query.section || null;
  if (db.isReady()) {
    try {
      const rows = await db.recentAudit(limit, section);
      // Normalise to legacy shape
      return res.json({ entries: rows.map(r => ({
        ts: r.ts, user: r.username, user_name: r.user_name,
        section: r.section, action: r.action, changes: r.changes
      })) });
    } catch (e) { console.warn('[audit] db read failed:', e.message); }
  }
  res.json({ entries: audit.recent(limit, section) });
});

router.get('/whoami', (req, res) => {
  res.json(req.cmsUser || { username: 'unknown', name: 'unknown', email: '' });
});

module.exports = router;
