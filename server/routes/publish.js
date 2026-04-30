const express = require('express');
const path = require('path');
const simpleGit = require('simple-git');

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..');

router.post('/publish/:section', async (req, res) => {
  const section = req.params.section;
  try {
    if (section === 'people') {
      require('../regen/people').run();
    } else {
      return res.status(400).json({ error: 'unknown section' });
    }

    const message = req.body && req.body.message ? String(req.body.message).slice(0, 200) : `CMS publish: ${section}`;
    const git = simpleGit(ROOT);
    await git.add(['content/', 'index.html', 'no/index.html']);
    const status = await git.status();
    if (status.staged.length === 0) return res.json({ ok: true, note: 'no changes to commit' });
    await git.commit(message);
    if (process.env.GIT_PUSH !== 'false') await git.push('origin', 'draft');

    res.json({ ok: true, committed: status.staged });
  } catch (err) {
    console.error('publish error', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
