const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..');

const REPO = process.env.GITHUB_REPO || 'jc230285/scale-42';
const BRANCH = process.env.GITHUB_BRANCH || 'draft';
const TOKEN = process.env.GITHUB_TOKEN;

async function gh(method, url, body) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN not set');
  const r = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${method} ${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function commitFiles(files, message) {
  const ref = await gh('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh('GET', `/repos/${REPO}/git/commits/${baseSha}`);

  const tree = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const blob = await gh('POST', `/repos/${REPO}/git/blobs`, {
      content: fs.readFileSync(abs).toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  }
  if (tree.length === 0) return null;

  const newTree = await gh('POST', `/repos/${REPO}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree,
  });
  const newCommit = await gh('POST', `/repos/${REPO}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [baseSha],
  });
  await gh('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha });
  return newCommit.sha;
}

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
