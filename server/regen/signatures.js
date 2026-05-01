const fs = require('fs');
const path = require('path');
const { buildSignatureHtml } = require('../signature');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'content', 'people.json');
const OUT = path.join(ROOT, 'signatures');

function slugFor(p) {
  return (p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');
}

const escAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function personPage(p, html) {
  const text = [p.name, p.role_en ? `${p.role_en} · Scale42` : 'Scale42', '', p.phone, p.email, 'https://www.scale-42.com', p.linkedin || ''].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escAttr(p.name)} — Email signature · Scale42</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg" />
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #f8fafb; color: #1c2e3f; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 16px; color: #6b7780; font-weight: 500; margin: 0 0 18px; }
  h1 strong { color: #1c2e3f; font-weight: 600; }
  .nav { font-size: 13px; margin-bottom: 24px; }
  .nav a { color: #2f6675; text-decoration: none; font-weight: 600; }
  .box { background: #fff; border: 1px solid #e5e8eb; border-radius: 12px; padding: 28px; margin-bottom: 18px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
  button { background: #2f6675; color: #fff; border: 0; padding: 10px 16px; border-radius: 8px; font: inherit; font-size: 14px; cursor: pointer; font-weight: 500; }
  button.ghost { background: transparent; color: #2f6675; border: 1px solid #2f6675; }
  details { background: #fff; border: 1px solid #e5e8eb; border-radius: 12px; padding: 18px 22px; }
  details summary { cursor: pointer; font-weight: 600; }
  pre { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; line-height: 1.5; background: #fafbfc; border-radius: 6px; padding: 12px; overflow: auto; max-height: 380px; }
  p.help { font-size: 13px; color: #6b7780; line-height: 1.55; }
  p.help strong { color: #1c2e3f; }
</style>
</head>
<body>
<div class="wrap">
  <p class="nav"><a href="../">← All signatures</a></p>
  <h1>Email signature for <strong>${escAttr(p.name)}</strong></h1>
  <div class="box">
    <div id="sig">${html}</div>
    <div class="actions">
      <button id="copy-rich">Copy for Gmail / Outlook</button>
      <button class="ghost" id="copy-html">Copy HTML source</button>
      <button class="ghost" id="copy-text">Copy plain text</button>
    </div>
    <p class="help" id="msg" style="margin-top:14px;"></p>
  </div>
  <details>
    <summary>HTML source</summary>
    <pre id="src"></pre>
  </details>
  <p class="help" style="margin-top:24px;"><strong>Outlook desktop:</strong> File → Options → Mail → Signatures → New → paste the rich version.<br/>
  <strong>Gmail:</strong> Settings → See all settings → Signature → paste the rich version.<br/>
  Photos load from scale-42.com so they render in any client.</p>
</div>
<script>
const HTML = ${JSON.stringify(html)};
const TEXT = ${JSON.stringify(text)};
document.getElementById('src').textContent = HTML;
const flash = (m) => { document.getElementById('msg').textContent = m; };
document.getElementById('copy-rich').addEventListener('click', async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([HTML], { type: 'text/html' }),
      'text/plain': new Blob([TEXT], { type: 'text/plain' }),
    })]);
    flash('✓ Copied — paste into your email client');
  } catch {
    const range = document.createRange(); range.selectNodeContents(document.getElementById('sig'));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('copy'); sel.removeAllRanges();
    flash('✓ Copied');
  }
});
document.getElementById('copy-html').addEventListener('click', async () => { await navigator.clipboard.writeText(HTML); flash('✓ HTML copied'); });
document.getElementById('copy-text').addEventListener('click', async () => { await navigator.clipboard.writeText(TEXT); flash('✓ Plain text copied'); });
</script>
</body>
</html>
`;
}

function indexPage(people) {
  const cards = people.map(p => {
    const slug = slugFor(p);
    const photo = p.photo
      ? `<img src="/${escAttr(p.photo)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex:0 0 auto;" />`
      : '<div style="width:48px;height:48px;border-radius:50%;background:#eef0f2;flex:0 0 auto;"></div>';
    return `    <a href="${escAttr(slug)}/" class="row">
      ${photo}
      <div class="info">
        <div class="name">${escAttr(p.name)}</div>
        <div class="meta">${escAttr(p.role_en || '')}${p.email ? ' · ' + escAttr(p.email) : ''}</div>
      </div>
      <span class="arrow">→</span>
    </a>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Email signatures · Scale42</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #f8fafb; color: #1c2e3f; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 56px 20px 80px; }
  h1 { font-size: 24px; margin: 0 0 8px; letter-spacing: -0.01em; }
  p.lede { color: #6b7780; font-size: 14.5px; line-height: 1.55; margin: 0 0 28px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: #fff; border: 1px solid #e5e8eb; border-radius: 10px; margin-bottom: 8px; text-decoration: none; color: inherit; transition: 0.12s; }
  .row:hover { border-color: #2f6675; transform: translateX(2px); }
  .row .info { flex: 1; min-width: 0; }
  .row .name { font-weight: 600; font-size: 14.5px; }
  .row .meta { font-size: 12.5px; color: #6b7780; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .arrow { color: #2f6675; font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Email signatures</h1>
  <p class="lede">Pick your name to get a copy-paste-ready signature for Gmail, Outlook, or any email client. Photos load from scale-42.com so they render in any client.</p>
${cards}
</div>
</body>
</html>
`;
}

function run() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const live = data.people.filter(p => p.published);
  fs.mkdirSync(OUT, { recursive: true });
  // Clean stale per-person dirs
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (entry.isDirectory()) fs.rmSync(path.join(OUT, entry.name), { recursive: true, force: true });
  }
  for (const p of live) {
    const slug = slugFor(p);
    const dir = path.join(OUT, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), personPage(p, buildSignatureHtml(p)), 'utf-8');
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(live), 'utf-8');
  console.log(`regen signatures: ${live.length} pages + index`);
}

module.exports = { run, files: ['content/people.json', 'signatures/index.html'] };
if (require.main === module) run();
