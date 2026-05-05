// Auth-required: view contact-form submissions stored on the running container.
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const INQ_PATH = path.resolve(__dirname, '..', '..', 'content', 'inquiries.json');

router.get('/inquiries', (req, res) => {
  let data = { items: [] };
  try { data = JSON.parse(fs.readFileSync(INQ_PATH, 'utf-8')); } catch {}
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  res.json({ count: (data.items || []).length, items: (data.items || []).slice(0, limit) });
});

module.exports = router;
