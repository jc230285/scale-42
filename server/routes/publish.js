const express = require('express');
const fs = require('fs');
const path = require('path');
const { commitFiles, BRANCH } = require('../github');

const router = express.Router();
const META_FILE = path.resolve(__dirname, '..', '..', 'content', 'published-meta.json');

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); } catch { return {}; }
}
function writeMeta(m) {
  fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2) + '\n', 'utf-8');
}

router.get('/published-meta', (req, res) => {
  res.json(readMeta());
});

router.post('/publish/:section', async (req, res) => {
  const section = req.params.section;
  let mod;
  try { mod = require(`../regen/${section}`); }
  catch { return res.status(400).json({ error: `unknown section: ${section}` }); }
  if (!mod.run || !Array.isArray(mod.files)) {
    return res.status(500).json({ error: `regen/${section} missing run() or files[]` });
  }
  try {
    await mod.run();
    // Keep sitemap fresh on every publish
    let allFiles = mod.files.slice();
    try {
      const sm = require('../regen/sitemap');
      sm.run();
      for (const f of sm.files) if (!allFiles.includes(f)) allFiles.push(f);
    } catch (e) { console.warn('sitemap regen skipped:', e.message); }
    const message = (req.body?.message ? String(req.body.message) : `CMS publish: ${section}`).slice(0, 200);
    const sha = await commitFiles(allFiles, message);
    const meta = readMeta();
    meta[section] = { at: new Date().toISOString(), commit: sha || meta[section]?.commit || null };
    writeMeta(meta);
    if (!sha) return res.json({ ok: true, note: 'no changes', meta: meta[section] });
    res.json({ ok: true, branch: BRANCH, commit: sha, meta: meta[section] });
  } catch (err) {
    console.error('publish error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
