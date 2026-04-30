const express = require('express');
const fs = require('fs');
const path = require('path');
const { commitFiles, BRANCH, PUBLIC_BRANCH } = require('../github');

const router = express.Router();
const META_FILE = path.resolve(__dirname, '..', '..', 'content', 'published-meta.json');

// Map section -> raw content files (committed on Save without regen)
const SECTION_RAW_FILES = {
  sites: ['content/sites.json', 'content/sites-schema.json'],
  people: ['content/people.json'],
  news: ['content/news.json'],
  sections: ['content/sections.json'],
};

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); } catch { return {}; }
}
function writeMeta(m) {
  fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2) + '\n', 'utf-8');
}

router.get('/published-meta', (req, res) => {
  res.json(readMeta());
});

// Save → commits raw JSON to draft branch (draft.scale-42.com reflects it after redeploy).
router.post('/save/:section', async (req, res) => {
  const section = req.params.section;
  const files = SECTION_RAW_FILES[section];
  if (!files) return res.status(400).json({ error: `unknown section: ${section}` });
  try {
    const message = `CMS save: ${section}`;
    const sha = await commitFiles(files, message, BRANCH);
    const meta = readMeta();
    meta[`${section}_draft`] = { at: new Date().toISOString(), commit: sha || meta[`${section}_draft`]?.commit || null };
    writeMeta(meta);
    res.json({ ok: true, branch: BRANCH, commit: sha, meta: meta[`${section}_draft`] });
  } catch (err) {
    console.error('save error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Publish → regen + commits HTML+JSON to master branch (live site rebuilds).
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
    let allFiles = mod.files.slice();
    try {
      const sm = require('../regen/sitemap');
      sm.run();
      for (const f of sm.files) if (!allFiles.includes(f)) allFiles.push(f);
    } catch (e) { console.warn('sitemap regen skipped:', e.message); }
    const message = (req.body?.message ? String(req.body.message) : `CMS publish: ${section}`).slice(0, 200);
    // Publish to BOTH draft (so draft site mirrors prod) and public branch (so live site rebuilds)
    const draftSha = await commitFiles(allFiles, message, BRANCH);
    const publicSha = await commitFiles(allFiles, message, PUBLIC_BRANCH);
    const meta = readMeta();
    meta[section] = { at: new Date().toISOString(), commit: publicSha || meta[section]?.commit || null };
    writeMeta(meta);
    if (!draftSha && !publicSha) return res.json({ ok: true, note: 'no changes', meta: meta[section] });
    res.json({ ok: true, draftBranch: BRANCH, draftCommit: draftSha, publicBranch: PUBLIC_BRANCH, publicCommit: publicSha, meta: meta[section] });
  } catch (err) {
    console.error('publish error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
