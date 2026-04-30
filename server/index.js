const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');
const fs = require('fs');

const app = express();
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' }));

// Light rate limit for /cms and /api (per-IP, in-memory)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;
const buckets = new Map();
app.use((req, res, next) => {
  if (!req.path.startsWith('/cms') && !req.path.startsWith('/api')) return next();
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > b.reset) { b.count = 0; b.reset = now + RATE_WINDOW_MS; }
  b.count++;
  buckets.set(ip, b);
  if (b.count > RATE_LIMIT) return res.status(429).json({ error: 'rate limit' });
  next();
});

// Discourage indexing of /cms even though it's basic-auth protected
app.use('/cms', (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// Multi-user auth. Loads from content/cms-users.json (committed to git).
// Falls back to CMS_USER/CMS_PASS env for first-run bootstrap.
const fs = require('fs');
function loadUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cms-users.json'), 'utf-8'));
    const m = {};
    for (const u of (raw.users || [])) m[u.username] = u.password;
    if (Object.keys(m).length) return m;
  } catch {}
  return { [process.env.CMS_USER || 'admin']: process.env.CMS_PASS || 'change-me' };
}
const auth = basicAuth({
  users: loadUsers(),
  challenge: true,
  realm: 'Scale42 CMS',
});

// Capture authenticated user details (name/email) for audit + git commit attribution
function attachUser(req, _res, next) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cms-users.json'), 'utf-8'));
    const u = (raw.users || []).find(x => x.username === req.auth?.user);
    req.cmsUser = u || { username: req.auth?.user || 'unknown', name: req.auth?.user || 'unknown', email: '' };
  } catch {
    req.cmsUser = { username: req.auth?.user || 'unknown', name: req.auth?.user || 'unknown', email: '' };
  }
  next();
}

app.use('/cms', auth, express.static(path.join(ROOT, 'cms-ui')));
app.use('/api', auth, attachUser, require('./routes/people'));
app.use('/api', auth, attachUser, require('./routes/sites'));
app.use('/api', auth, attachUser, require('./routes/news'));
app.use('/api', auth, attachUser, require('./routes/sections'));
app.use('/api', auth, attachUser, require('./routes/upload'));
app.use('/api', auth, attachUser, require('./routes/publish'));
app.use('/api', auth, attachUser, require('./routes/audit'));

app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
}));

app.use((req, res) => {
  const fallback = path.join(ROOT, '404.html');
  if (fs.existsSync(fallback)) return res.status(404).sendFile(fallback);
  res.status(404).send('Not found');
});

app.listen(PORT, () => console.log(`Scale42 server on :${PORT}`));
