const express = require('express');
const db = require('../db');
const router = express.Router();

// Self-serve: change own password
router.post('/account/password', express.json(), async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (!db.isReady()) return res.status(503).json({ error: 'DB not configured (DATABASE_URL missing)' });
  const username = req.cmsUser?.username;
  if (!username) return res.status(401).json({ error: 'not signed in' });
  // Verify current
  const ok = await db.verifyPassword(username, String(current || ''));
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
  await db.setPassword(username, String(next));
  res.json({ ok: true });
});

// Admin-only: list users
router.get('/users', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'DB not configured' });
  if (!req.cmsUser?.is_admin) return res.status(403).json({ error: 'admin only' });
  res.json({ users: await db.listUsers() });
});

// Admin-only: add or update a user
router.put('/users/:username', express.json(), async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'DB not configured' });
  if (!req.cmsUser?.is_admin) return res.status(403).json({ error: 'admin only' });
  const { name, email, password, is_admin } = req.body || {};
  await db.upsertUser({ username: req.params.username, name, email, password, is_admin });
  res.json({ ok: true });
});

// Admin-only: delete a user
router.delete('/users/:username', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'DB not configured' });
  if (!req.cmsUser?.is_admin) return res.status(403).json({ error: 'admin only' });
  if (req.params.username === req.cmsUser.username) return res.status(400).json({ error: "can't delete yourself" });
  await db.deleteUser(req.params.username);
  res.json({ ok: true });
});

module.exports = router;
