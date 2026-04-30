const express = require('express');
const { commitFiles, BRANCH } = require('../github');

const router = express.Router();

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
    const message = (req.body?.message ? String(req.body.message) : `CMS publish: ${section}`).slice(0, 200);
    const sha = await commitFiles(mod.files, message);
    if (!sha) return res.json({ ok: true, note: 'no changes' });
    res.json({ ok: true, branch: BRANCH, commit: sha });
  } catch (err) {
    console.error('publish error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
