const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = process.env.GITHUB_REPO || 'jc230285/scale-42';
const BRANCH = process.env.GITHUB_BRANCH || 'draft';
const TOKEN = () => process.env.GITHUB_TOKEN;

async function gh(method, url, body) {
  if (!TOKEN()) throw new Error('GITHUB_TOKEN not set');
  const r = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${method} ${url} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function commitFiles(files, message, branch = BRANCH) {
  const ref = await gh('GET', `/repos/${REPO}/git/ref/heads/${branch}`);
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
    base_tree: baseCommit.tree.sha, tree,
  });
  const newCommit = await gh('POST', `/repos/${REPO}/git/commits`, {
    message, tree: newTree.sha, parents: [baseSha],
  });
  await gh('PATCH', `/repos/${REPO}/git/refs/heads/${branch}`, { sha: newCommit.sha });
  return newCommit.sha;
}

const PUBLIC_BRANCH = process.env.GITHUB_PUBLIC_BRANCH || 'master';

module.exports = { commitFiles, BRANCH, PUBLIC_BRANCH };
