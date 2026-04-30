const express = require('express');
const fs = require('fs');
const path = require('path');
const { commitFiles } = require('../github');

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..');

const ALLOWED_FOLDERS = new Set(['team', 'sites', 'news']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);
const MAX_BYTES = 8 * 1024 * 1024;

const { randomUUID } = require('crypto');

router.post('/upload', async (req, res) => {
  try {
    const { folder, filename, base64 } = req.body || {};
    if (!ALLOWED_FOLDERS.has(folder)) return res.status(400).json({ error: 'invalid folder' });
    if (!filename || !base64) return res.status(400).json({ error: 'filename and base64 required' });

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: `extension not allowed: ${ext}` });

    const buf = Buffer.from(base64, 'base64');
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'file too large (max 8 MB)' });

    // UUID-based filename so concurrent uploads don't clash and content is content-addressable
    const cleanName = `${randomUUID()}${ext}`;
    const relPath = `assets/${folder}/${cleanName}`;
    const absPath = path.join(ROOT, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, buf);

    try {
      await commitFiles([relPath], `CMS upload: ${relPath}`);
    } catch (err) {
      console.error('upload commit failed:', err.message);
      return res.json({ ok: true, path: relPath, committed: false, warning: 'saved locally; not committed (GITHUB_TOKEN missing or push failed)' });
    }
    res.json({ ok: true, path: relPath, committed: true });
  } catch (err) {
    console.error('upload error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
